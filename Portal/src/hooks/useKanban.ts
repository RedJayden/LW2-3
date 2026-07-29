import { useState, useEffect } from 'react';
import { KanbanTask, ColumnStatus } from '../types/kanban';

const STORAGE_KEY = 'semicon_kanban_tasks';

const defaultTasks: KanbanTask[] = [
  { id: '1', title: 'Wafer #1 Alignment', description: 'Align wafer on chuck before etching', status: 'TODO', priority: 'high' },
  { id: '2', title: 'Chamber Vacuum', description: 'Pump down to 10e-6 Torr', status: 'IN_PROGRESS', priority: 'high' },
  { id: '3', title: 'Inspection module', description: 'Visual defect setup', status: 'DONE', priority: 'medium' }
];

export function useKanban() {
  const [tasks, setTasks] = useState<KanbanTask[]>([]);
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setTasks(JSON.parse(stored));
      } else {
        setTasks(defaultTasks);
      }
    } catch (e) {
      console.error('Failed to parse tasks', e);
      setTasks(defaultTasks);
    }
  }, []);

  const saveTasks = (newTasks: KanbanTask[]) => {
    setTasks(newTasks);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newTasks));
    } catch (e) {
      console.error('Failed to save tasks', e);
    }
  };

  const handleDragStart = (id: string) => {
    setDraggedTaskId(id);
  };

  const handleDragEnd = () => {
    setDraggedTaskId(null);
  };

  const handleDrop = (status: ColumnStatus) => {
    if (!draggedTaskId) return;

    try {
      const newTasks = tasks.map(t => 
        t.id === draggedTaskId ? { ...t, status } : t
      );
      saveTasks(newTasks);
    } catch (e) {
      // In case of error (e.g., storage quota), original tasks remain unchanged in state
      console.error('Drop failed, restoring task state', e);
    } finally {
      setDraggedTaskId(null);
    }
  };

  return { tasks, handleDragStart, handleDrop, handleDragEnd, draggedTaskId };
}
