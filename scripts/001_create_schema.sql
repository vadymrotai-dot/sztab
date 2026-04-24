-- Sztab CRM Database Schema

-- Clients table
CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  nip TEXT,
  city TEXT,
  address TEXT,
  region TEXT,
  industry TEXT,
  email TEXT,
  phone TEXT,
  notes TEXT,
  segment TEXT DEFAULT 'niesklasyfikowany',
  status TEXT DEFAULT 'nowy',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Contacts table
CREATE TABLE IF NOT EXISTS contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Deals table
CREATE TABLE IF NOT EXISTS deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  stage TEXT DEFAULT 'lead',
  amount NUMERIC DEFAULT 0,
  close_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Products table
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lp INTEGER,
  category TEXT,
  name TEXT NOT NULL,
  weight TEXT,
  ean TEXT,
  koszt_eur NUMERIC DEFAULT 0,
  koszt_pln NUMERIC DEFAULT 0,
  price_maly NUMERIC DEFAULT 0,
  price_sredni NUMERIC DEFAULT 0,
  price_duzy NUMERIC DEFAULT 0,
  price_katalog NUMERIC DEFAULT 0,
  price_docel NUMERIC DEFAULT 0,
  zysk_maly NUMERIC DEFAULT 0,
  zysk_duzy NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Tasks table
CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  due DATE,
  time TEXT,
  sphere TEXT DEFAULT 'praca',
  priority TEXT DEFAULT 'normal',
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  goal_id UUID,
  done BOOLEAN DEFAULT FALSE,
  completed_at DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Goals table
CREATE TABLE IF NOT EXISTS goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  sphere TEXT,
  deadline DATE,
  target NUMERIC DEFAULT 0,
  current NUMERIC DEFAULT 0,
  unit TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Add foreign key from tasks to goals after goals table exists
ALTER TABLE tasks ADD CONSTRAINT tasks_goal_id_fkey 
  FOREIGN KEY (goal_id) REFERENCES goals(id) ON DELETE SET NULL;

-- Habits table
CREATE TABLE IF NOT EXISTS habits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  log JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Params table (single row per user for settings)
CREATE TABLE IF NOT EXISTS params (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kurs_eur_pln NUMERIC DEFAULT 4.28,
  overhead NUMERIC DEFAULT 1.15,
  anthropic_key TEXT,
  gemini_key TEXT,
  openrouter_key TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Enable Row Level Security on all tables
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE habits ENABLE ROW LEVEL SECURITY;
ALTER TABLE params ENABLE ROW LEVEL SECURITY;

-- RLS Policies for clients
CREATE POLICY "clients_select_own" ON clients FOR SELECT USING (auth.uid() = owner_id);
CREATE POLICY "clients_insert_own" ON clients FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "clients_update_own" ON clients FOR UPDATE USING (auth.uid() = owner_id);
CREATE POLICY "clients_delete_own" ON clients FOR DELETE USING (auth.uid() = owner_id);

-- RLS Policies for contacts
CREATE POLICY "contacts_select_own" ON contacts FOR SELECT USING (auth.uid() = owner_id);
CREATE POLICY "contacts_insert_own" ON contacts FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "contacts_update_own" ON contacts FOR UPDATE USING (auth.uid() = owner_id);
CREATE POLICY "contacts_delete_own" ON contacts FOR DELETE USING (auth.uid() = owner_id);

-- RLS Policies for deals
CREATE POLICY "deals_select_own" ON deals FOR SELECT USING (auth.uid() = owner_id);
CREATE POLICY "deals_insert_own" ON deals FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "deals_update_own" ON deals FOR UPDATE USING (auth.uid() = owner_id);
CREATE POLICY "deals_delete_own" ON deals FOR DELETE USING (auth.uid() = owner_id);

-- RLS Policies for products
CREATE POLICY "products_select_own" ON products FOR SELECT USING (auth.uid() = owner_id);
CREATE POLICY "products_insert_own" ON products FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "products_update_own" ON products FOR UPDATE USING (auth.uid() = owner_id);
CREATE POLICY "products_delete_own" ON products FOR DELETE USING (auth.uid() = owner_id);

-- RLS Policies for tasks
CREATE POLICY "tasks_select_own" ON tasks FOR SELECT USING (auth.uid() = owner_id);
CREATE POLICY "tasks_insert_own" ON tasks FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "tasks_update_own" ON tasks FOR UPDATE USING (auth.uid() = owner_id);
CREATE POLICY "tasks_delete_own" ON tasks FOR DELETE USING (auth.uid() = owner_id);

-- RLS Policies for goals
CREATE POLICY "goals_select_own" ON goals FOR SELECT USING (auth.uid() = owner_id);
CREATE POLICY "goals_insert_own" ON goals FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "goals_update_own" ON goals FOR UPDATE USING (auth.uid() = owner_id);
CREATE POLICY "goals_delete_own" ON goals FOR DELETE USING (auth.uid() = owner_id);

-- RLS Policies for habits
CREATE POLICY "habits_select_own" ON habits FOR SELECT USING (auth.uid() = owner_id);
CREATE POLICY "habits_insert_own" ON habits FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "habits_update_own" ON habits FOR UPDATE USING (auth.uid() = owner_id);
CREATE POLICY "habits_delete_own" ON habits FOR DELETE USING (auth.uid() = owner_id);

-- RLS Policies for params
CREATE POLICY "params_select_own" ON params FOR SELECT USING (auth.uid() = owner_id);
CREATE POLICY "params_insert_own" ON params FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "params_update_own" ON params FOR UPDATE USING (auth.uid() = owner_id);
CREATE POLICY "params_delete_own" ON params FOR DELETE USING (auth.uid() = owner_id);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_clients_owner_id ON clients(owner_id);
CREATE INDEX IF NOT EXISTS idx_clients_segment ON clients(segment);
CREATE INDEX IF NOT EXISTS idx_clients_status ON clients(status);
CREATE INDEX IF NOT EXISTS idx_contacts_client_id ON contacts(client_id);
CREATE INDEX IF NOT EXISTS idx_deals_client_id ON deals(client_id);
CREATE INDEX IF NOT EXISTS idx_deals_stage ON deals(stage);
CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due);
CREATE INDEX IF NOT EXISTS idx_tasks_done ON tasks(done);
CREATE INDEX IF NOT EXISTS idx_tasks_client_id ON tasks(client_id);
