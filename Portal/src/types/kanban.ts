export type ColumnStatus = 'TODO' | 'IN_PROGRESS' | 'DONE';

export interface KanbanTask {
  id: string;
  title: string;
  description: string;
  status: ColumnStatus;
  priority: 'low' | 'medium' | 'high';
}
