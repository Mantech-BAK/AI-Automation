export interface Site {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  status: string;
  created_at: string;
}

export interface Technician {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  specialization: string | null;
  department: string | null;
  status: string;
  created_at: string;
}

export interface Equipment {
  id: string;
  name: string;
  model: string | null;
  serial_number: string | null;
  site_id: string | null;
  status: string;
  last_maintenance_date: string | null;
  next_maintenance_date: string | null;
  created_at: string;
  sites?: Site;
}

export interface MaintenanceTask {
  id: string;
  title: string;
  description: string | null;
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: 'pending' | 'in_progress' | 'completed' | 'overdue';
  site_id: string | null;
  equipment_id: string | null;
  assigned_to: string | null;
  due_date: string | null;
  completed_at: string | null;
  created_at: string;
  sites?: Site;
  equipment?: Equipment;
  technicians?: Technician;
}

export interface ProcessedEmail {
  id: string;
  sender: string;
  subject: string;
  ai_summary: string | null;
  category: 'maintenance_request' | 'work_report' | 'vendor' | 'escalation' | 'inquiry' | 'other';
  action_items: string[];
  processed_at: string;
  created_at: string;
}

export interface Notification {
  id: string;
  title: string;
  message: string | null;
  type: 'info' | 'success' | 'warning' | 'error';
  is_read: boolean;
  related_task_id: string | null;
  created_at: string;
}

export interface Schedule {
  id: string;
  title: string;
  equipment_id: string | null;
  site_id: string | null;
  assigned_to: string | null;
  frequency: string;
  next_due_date: string | null;
  status: string;
  created_at: string;
  equipment?: Equipment;
  sites?: Site;
  technicians?: Technician;
}
