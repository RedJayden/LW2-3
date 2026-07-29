import React from 'react';
import { ColumnStatus, KanbanTask } from '../types/kanban';
import { TaskCard } from './TaskCard';

interface Props {
  title: string;
  status: ColumnStatus;
  tasks: KanbanTask[];
  onDragStart: (id: string) => void;
  onDrop: (status: ColumnStatus) => void;
  onDragEnd: () => void;
}

export const Column: React.FC<Props> = ({ title, status, tasks, onDragStart, onDrop, onDragEnd }) => {
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault(); // necessary to allow dropping
  };

  return (
    <div 
      className="flex flex-col bg-gray-50 dark:bg-zinc-900 rounded-lg p-4 w-1/3 min-h-[500px] border border-gray-200 dark:border-zinc-800"
      onDragOver={handleDragOver}
      onDrop={(e) => {
        e.preventDefault();
        onDrop(status);
      }}
    >
      <div className="flex justify-between items-center mb-4 pb-2 border-b border-gray-300 dark:border-zinc-700">
        <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200 uppercase tracking-widest">{title}</h3>
        <span className="bg-gray-200 dark:bg-zinc-800 text-xs font-semibold px-2 py-1 rounded-full text-gray-700 dark:text-gray-300">{tasks.length}</span>
      </div>
      <div className="flex-1 overflow-y-auto">
        {tasks.map(task => (
          <TaskCard 
            key={task.id} 
            task={task} 
            onDragStart={onDragStart} 
            onDragEnd={onDragEnd} 
          />
        ))}
      </div>
    </div>
  );
};
