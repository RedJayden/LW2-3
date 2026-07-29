import React from 'react';
import { useKanban } from '../hooks/useKanban';
import { Column } from './Column';
import { MantineProvider } from '@mantine/core';

// This acts as the main page for the Semiconductor Equipment Kanban
export const KanbanBoard: React.FC = () => {
  const { tasks, handleDragStart, handleDrop, handleDragEnd } = useKanban();

  return (
    <MantineProvider defaultColorScheme="dark">
      <div className="p-8 bg-zinc-950 min-h-screen text-white font-sans flex flex-col items-center">
        <div className="w-full max-w-6xl mb-8 flex justify-between items-end border-b border-zinc-800 pb-4">
          <div>
            <h1 className="text-3xl font-bold text-blue-400">Process Dashboard</h1>
            <p className="text-zinc-400 mt-2">Semiconductor Equipment Process Management</p>
          </div>
          <div className="text-xs text-zinc-500 font-mono bg-zinc-900 p-2 rounded border border-zinc-800">Coordinate System: X+ Right, Y+ Up</div>
        </div>
        
        <div className="flex gap-6 w-full max-w-6xl">
          <Column 
            title="Wafer Queue" 
            status="TODO" 
            tasks={tasks.filter(t => t.status === 'TODO')} 
            onDragStart={handleDragStart} 
            onDrop={handleDrop} 
            onDragEnd={handleDragEnd}
          />
          <Column 
            title="Processing chamber" 
            status="IN_PROGRESS" 
            tasks={tasks.filter(t => t.status === 'IN_PROGRESS')} 
            onDragStart={handleDragStart} 
            onDrop={handleDrop} 
            onDragEnd={handleDragEnd}
          />
          <Column 
            title="Completed / Inspection" 
            status="DONE" 
            tasks={tasks.filter(t => t.status === 'DONE')} 
            onDragStart={handleDragStart} 
            onDrop={handleDrop} 
            onDragEnd={handleDragEnd}
          />
        </div>
      </div>
    </MantineProvider>
  );
};
