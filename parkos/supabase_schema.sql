-- ============================================================
--  PARKOS — Supabase / PostgreSQL Schema
--  Run this in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================


-- TABLE 1: vehicles
CREATE TABLE IF NOT EXISTS vehicles (
    vehicle_id     SERIAL PRIMARY KEY,
    vehicle_number VARCHAR(20) NOT NULL UNIQUE,
    vehicle_type   VARCHAR(10) NOT NULL DEFAULT 'Car'
                   CHECK (vehicle_type IN ('Bike', 'Car', 'Truck')),
    created_at     TIMESTAMP DEFAULT NOW()
);

-- TABLE 2: slots
CREATE TABLE IF NOT EXISTS slots (
    slot_id     SERIAL PRIMARY KEY,
    slot_number VARCHAR(10) NOT NULL UNIQUE,
    slot_type   VARCHAR(10) NOT NULL DEFAULT 'Car'
                CHECK (slot_type IN ('Bike', 'Car', 'Truck')),
    is_occupied BOOLEAN DEFAULT FALSE
);

-- TABLE 3: visits
CREATE TABLE IF NOT EXISTS visits (
    visit_id    SERIAL PRIMARY KEY,
    vehicle_id  INT NOT NULL REFERENCES vehicles(vehicle_id) ON DELETE CASCADE,
    slot_id     INT NOT NULL REFERENCES slots(slot_id) ON DELETE CASCADE,
    entry_time  TIMESTAMP DEFAULT NOW(),
    exit_time   TIMESTAMP DEFAULT NULL,
    amount_paid DECIMAL(6,2) DEFAULT NULL
);


-- ============================================================
-- SAMPLE DATA — Slots (10 car, 5 bike, 3 truck)
-- ============================================================
INSERT INTO slots (slot_number, slot_type) VALUES
('C01','Car'),('C02','Car'),('C03','Car'),('C04','Car'),('C05','Car'),
('C06','Car'),('C07','Car'),('C08','Car'),('C09','Car'),('C10','Car'),
('B01','Bike'),('B02','Bike'),('B03','Bike'),('B04','Bike'),('B05','Bike'),
('T01','Truck'),('T02','Truck'),('T03','Truck')
ON CONFLICT (slot_number) DO NOTHING;

-- Sample vehicles
INSERT INTO vehicles (vehicle_number, vehicle_type) VALUES
('KA01AB1234', 'Car'),
('KA02CD5678', 'Bike'),
('KA03EF9012', 'Car')
ON CONFLICT (vehicle_number) DO NOTHING;

-- Sample visits (vehicle 1 has 6 visits → qualifies for 40% discount)
INSERT INTO visits (vehicle_id, slot_id, entry_time, exit_time, amount_paid) VALUES
(1, 1, '2024-01-01 09:00:00', '2024-01-01 11:00:00', 30.00),
(1, 2, '2024-01-03 10:00:00', '2024-01-03 12:00:00', 30.00),
(1, 1, '2024-01-05 09:30:00', '2024-01-05 10:30:00', 30.00),
(1, 3, '2024-01-08 08:00:00', '2024-01-08 09:00:00', 30.00),
(1, 2, '2024-01-10 11:00:00', '2024-01-10 13:00:00', 30.00),
(1, 1, '2024-01-12 10:00:00', '2024-01-12 12:00:00', 18.00),
(2, 11,'2024-01-02 08:00:00', '2024-01-02 09:00:00', 30.00),
(3, 4, '2024-01-04 14:00:00', '2024-01-04 15:00:00', 30.00);


-- ============================================================
-- IMPORTANT: Disable Row Level Security (RLS) for all tables
-- so the anon key can read/write freely.
-- Run each line separately if needed.
-- ============================================================
ALTER TABLE vehicles DISABLE ROW LEVEL SECURITY;
ALTER TABLE slots    DISABLE ROW LEVEL SECURITY;
ALTER TABLE visits   DISABLE ROW LEVEL SECURITY;
