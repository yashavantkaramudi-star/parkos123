const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  // Parse action + params from GET or POST
  let params = {};
  if (event.httpMethod === 'POST') {
    const ct = event.headers['content-type'] || '';
    if (ct.includes('application/json')) {
      params = JSON.parse(event.body || '{}');
    } else {
      // form-data / urlencoded
      const qs = new URLSearchParams(event.body || '');
      for (const [k, v] of qs.entries()) params[k] = v;
    }
  }
  const qs2 = new URLSearchParams(event.queryStringParameters || {});
  for (const [k, v] of qs2.entries()) if (!params[k]) params[k] = v;

  const action = params.action || '';

  try {
    switch (action) {

      // ── CHECK-IN ──────────────────────────────────────────
      case 'checkin': {
        const vehicle_number = (params.vehicle_number || '').toUpperCase().trim();
        const vehicle_type   = params.vehicle_type || 'Car';

        if (!vehicle_number)
          return respond(headers, { success: false, message: 'Vehicle number is required.' });

        // 1. Get or create vehicle
        let vehicle_id;
        const { data: existing } = await supabase
          .from('vehicles')
          .select('vehicle_id')
          .eq('vehicle_number', vehicle_number)
          .maybeSingle();

        if (existing) {
          vehicle_id = existing.vehicle_id;
        } else {
          const { data: newV, error: vErr } = await supabase
            .from('vehicles')
            .insert({ vehicle_number, vehicle_type })
            .select('vehicle_id')
            .single();
          if (vErr) throw vErr;
          vehicle_id = newV.vehicle_id;
        }

        // 2. Check if already checked in
        const { data: activeVisit } = await supabase
          .from('visits')
          .select('visit_id')
          .eq('vehicle_id', vehicle_id)
          .is('exit_time', null)
          .maybeSingle();

        if (activeVisit)
          return respond(headers, { success: false, message: 'Vehicle is already checked in.' });

        // 3. Find available slot
        const { data: slot } = await supabase
          .from('slots')
          .select('slot_id, slot_number')
          .eq('slot_type', vehicle_type)
          .eq('is_occupied', false)
          .limit(1)
          .maybeSingle();

        if (!slot)
          return respond(headers, { success: false, message: `No available ${vehicle_type} slots right now.` });

        // 4. Insert visit
        const { data: visit, error: visErr } = await supabase
          .from('visits')
          .insert({ vehicle_id, slot_id: slot.slot_id })
          .select('visit_id')
          .single();
        if (visErr) throw visErr;

        // 5. Mark slot occupied (trigger equivalent)
        await supabase.from('slots').update({ is_occupied: true }).eq('slot_id', slot.slot_id);

        // 6. Total visit count
        const { count: total_visits } = await supabase
          .from('visits')
          .select('*', { count: 'exact', head: true })
          .eq('vehicle_id', vehicle_id);

        return respond(headers, {
          success: true,
          message: 'Check-in successful!',
          visit_id: visit.visit_id,
          slot_number: slot.slot_number,
          total_visits,
          entry_time: fmtDate(new Date()),
        });
      }

      // ── CHECK-OUT ─────────────────────────────────────────
      case 'checkout': {
        const vehicle_number = (params.vehicle_number || '').toUpperCase().trim();

        if (!vehicle_number)
          return respond(headers, { success: false, message: 'Vehicle number is required.' });

        // Find active visit
        const { data: visitRow } = await supabase
          .from('visits')
          .select('visit_id, vehicle_id, slot_id, entry_time, vehicles(vehicle_number)')
          .eq('vehicles.vehicle_number', vehicle_number)
          .is('exit_time', null)
          .maybeSingle();

        // Alternative query joining via vehicle lookup
        const { data: veh } = await supabase
          .from('vehicles')
          .select('vehicle_id')
          .eq('vehicle_number', vehicle_number)
          .maybeSingle();

        if (!veh)
          return respond(headers, { success: false, message: 'No active check-in found for this vehicle.' });

        const { data: activeV } = await supabase
          .from('visits')
          .select('visit_id, slot_id, entry_time')
          .eq('vehicle_id', veh.vehicle_id)
          .is('exit_time', null)
          .maybeSingle();

        if (!activeV)
          return respond(headers, { success: false, message: 'No active check-in found for this vehicle.' });

        // Count past completed visits
        const { count: past_visits } = await supabase
          .from('visits')
          .select('*', { count: 'exact', head: true })
          .eq('vehicle_id', veh.vehicle_id)
          .not('exit_time', 'is', null);

        // Calculate discount (stored procedure equivalent)
        let amount;
        if (past_visits >= 8)      amount = 7.50;   // 75% discount
        else if (past_visits >= 5) amount = 18.00;  // 40% discount
        else                        amount = 30.00;  // Full price

        const exitTime = new Date();

        // Update visit
        await supabase
          .from('visits')
          .update({ exit_time: exitTime.toISOString(), amount_paid: amount })
          .eq('visit_id', activeV.visit_id);

        // Free the slot (trigger equivalent)
        await supabase.from('slots').update({ is_occupied: false }).eq('slot_id', activeV.slot_id);

        // Duration
        const entry = new Date(activeV.entry_time);
        const diffMs = exitTime - entry;
        const diffMin = Math.floor(diffMs / 60000);
        const duration = diffMin >= 60
          ? `${Math.floor(diffMin / 60)}h ${diffMin % 60}min`
          : `${diffMin}min`;

        // Discount label — based on visits *before* this one
        let discount_label = 'No discount';
        if (past_visits >= 7)      discount_label = '75% loyalty discount';
        else if (past_visits >= 4) discount_label = '40% loyalty discount';

        return respond(headers, {
          success: true,
          message: 'Check-out successful!',
          vehicle_number,
          entry_time: fmtDate(entry),
          exit_time: fmtDate(exitTime),
          duration,
          past_visits: past_visits + 1,
          discount_label,
          amount_paid: amount.toFixed(2),
        });
      }

      // ── SLOTS ─────────────────────────────────────────────
      case 'slots': {
        const { data: slots } = await supabase
          .from('slots')
          .select('slot_id, slot_number, slot_type, is_occupied')
          .order('slot_type')
          .order('slot_number');

        // Build summary
        const summary = {};
        for (const s of slots || []) {
          if (!summary[s.slot_type]) summary[s.slot_type] = { slot_type: s.slot_type, total: 0, occupied: 0 };
          summary[s.slot_type].total++;
          if (s.is_occupied) summary[s.slot_type].occupied++;
        }
        for (const k of Object.keys(summary)) {
          summary[k].available = summary[k].total - summary[k].occupied;
        }

        return respond(headers, { success: true, slots, summary });
      }

      // ── HISTORY ───────────────────────────────────────────
      case 'history': {
        const vehicle_number = (params.vehicle_number || '').toUpperCase().trim();
        if (!vehicle_number)
          return respond(headers, { success: false, message: 'Vehicle number is required.' });

        const { data: veh } = await supabase
          .from('vehicles')
          .select('vehicle_id, vehicle_type')
          .eq('vehicle_number', vehicle_number)
          .maybeSingle();

        if (!veh)
          return respond(headers, { success: false, message: 'No visits found for this vehicle.' });

        const { data: visits } = await supabase
          .from('visits')
          .select('visit_id, entry_time, exit_time, amount_paid, slots(slot_number)')
          .eq('vehicle_id', veh.vehicle_id)
          .order('entry_time', { ascending: false })
          .limit(20);

        if (!visits || visits.length === 0)
          return respond(headers, { success: false, message: 'No visits found for this vehicle.' });

        let total_spent = 0;
        const formatted = visits.map(v => {
          total_spent += parseFloat(v.amount_paid || 0);
          const entry = new Date(v.entry_time);
          const exit  = v.exit_time ? new Date(v.exit_time) : null;
          const duration_mins = exit ? Math.floor((exit - entry) / 60000) : null;
          return {
            visit_id: v.visit_id,
            slot_number: v.slots?.slot_number || '—',
            entry_time: v.entry_time,
            exit_time: v.exit_time,
            duration_mins,
            amount_paid: v.amount_paid,
            vehicle_type: veh.vehicle_type,
          };
        });

        return respond(headers, {
          success: true,
          vehicle: vehicle_number,
          visits: formatted,
          total_visits: formatted.length,
          total_spent: total_spent.toFixed(2),
        });
      }

      // ── DASHBOARD ─────────────────────────────────────────
      case 'dashboard': {
        const todayStr = new Date().toISOString().slice(0, 10);

        // Today's visits
        const { data: todayVisits } = await supabase
          .from('visits')
          .select('vehicle_id, amount_paid')
          .gte('entry_time', `${todayStr}T00:00:00`)
          .lte('entry_time', `${todayStr}T23:59:59`);

        const today = {
          vehicles_today: new Set((todayVisits || []).map(v => v.vehicle_id)).size,
          visits_today:   (todayVisits || []).length,
          revenue_today:  (todayVisits || []).reduce((s, v) => s + parseFloat(v.amount_paid || 0), 0),
        };

        // All time
        const { data: allVisits } = await supabase
          .from('visits')
          .select('vehicle_id, amount_paid');

        const all_time = {
          total_vehicles: new Set((allVisits || []).map(v => v.vehicle_id)).size,
          total_visits:   (allVisits || []).length,
          total_revenue:  (allVisits || []).reduce((s, v) => s + parseFloat(v.amount_paid || 0), 0),
        };

        // Slot summary
        const { data: allSlots } = await supabase
          .from('slots')
          .select('slot_type, is_occupied');

        const slotMap = {};
        for (const s of allSlots || []) {
          if (!slotMap[s.slot_type]) slotMap[s.slot_type] = { slot_type: s.slot_type, total: 0, occupied: 0 };
          slotMap[s.slot_type].total++;
          if (s.is_occupied) slotMap[s.slot_type].occupied++;
        }
        const slots = Object.values(slotMap).map(s => ({ ...s, available: s.total - s.occupied }));

        // Recent visits
        const { data: recentRaw } = await supabase
          .from('visits')
          .select('entry_time, exit_time, amount_paid, vehicles(vehicle_number, vehicle_type), slots(slot_number)')
          .order('entry_time', { ascending: false })
          .limit(8);

        const recent_visits = (recentRaw || []).map(v => ({
          vehicle_number: v.vehicles?.vehicle_number,
          vehicle_type:   v.vehicles?.vehicle_type,
          slot_number:    v.slots?.slot_number,
          entry_time:     v.entry_time,
          exit_time:      v.exit_time,
          amount_paid:    v.amount_paid,
        }));

        // Frequent visitors (5+ visits)
        const { data: allVehicles } = await supabase
          .from('vehicles')
          .select('vehicle_id, vehicle_number, vehicle_type');

        const { data: completedVisits } = await supabase
          .from('visits')
          .select('vehicle_id, entry_time, amount_paid')
          .not('exit_time', 'is', null);

        const freqMap = {};
        for (const v of completedVisits || []) {
          if (!freqMap[v.vehicle_id]) freqMap[v.vehicle_id] = { count: 0, total_spent: 0, last_visit: null };
          freqMap[v.vehicle_id].count++;
          freqMap[v.vehicle_id].total_spent += parseFloat(v.amount_paid || 0);
          if (!freqMap[v.vehicle_id].last_visit || v.entry_time > freqMap[v.vehicle_id].last_visit)
            freqMap[v.vehicle_id].last_visit = v.entry_time;
        }

        const frequent = (allVehicles || [])
          .filter(veh => freqMap[veh.vehicle_id]?.count >= 5)
          .map(veh => ({
            vehicle_number: veh.vehicle_number,
            vehicle_type:   veh.vehicle_type,
            total_visits:   freqMap[veh.vehicle_id].count,
            total_spent:    freqMap[veh.vehicle_id].total_spent.toFixed(2),
            last_visit:     freqMap[veh.vehicle_id].last_visit,
          }))
          .sort((a, b) => b.total_visits - a.total_visits)
          .slice(0, 5);

        return respond(headers, { success: true, today, all_time, slots, recent_visits, frequent });
      }

      default:
        return respond(headers, { success: false, message: 'Invalid action.' });
    }
  } catch (err) {
    console.error(err);
    return respond(headers, { success: false, message: 'Server error: ' + err.message });
  }
};

function respond(headers, body) {
  return { statusCode: 200, headers, body: JSON.stringify(body) };
}

function fmtDate(d) {
  return d.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
}
