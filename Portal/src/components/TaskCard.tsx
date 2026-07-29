import React from 'react';
import { KanbanTask } from '../types/kanban';
import { Badge, Card, Text, Group } from '@mantine/core';

interface Props {
  task: KanbanTask;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
}

export const TaskCard: React.FC<Props> = ({ task, onDragStart, onDragEnd }) => {
  return (
    <Card 
      draggable
      onDragStart={() => onDragStart(task.id)}
      onDragEnd={onDragEnd}
      shadow="sm" 
      p="sm" 
      radius="md" 
      withBorder
      className="mb-3 cursor-grab active:cursor-grabbing bg-white dark:bg-zinc-800 transition-shadow hover:shadow-md border border-gray-200 dark:border-zinc-700"
    >
      <Group justify="space-between" mb="xs">
        <Text fw={500} size="sm" className="text-gray-900 dark:text-gray-100">{task.title}</Text>
        <Badge color={task.priority === 'high' ? 'red' : 'blue'}>{task.priority}</Badge>
      </Group>
      <Text size="xs" className="text-gray-500 dark:text-gray-400">{task.description}</Text>
    </Card>
  );
};
