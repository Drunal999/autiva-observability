'use client'

import { useMemo } from 'react'
import useSWR from 'swr'
import { useTable } from '@tanstack/react-table'
import {
  DataGrid,
  DataGridContainer,
  dataGridFeatures,
} from '@/components/reui/data-grid/data-grid'
import { DataGridTable } from '@/components/reui/data-grid/data-grid-table'
import type { Task } from '@/types/task'

const fetcher = (url: string) => fetch(url).then((res) => res.json())

const statusLabels: Record<string, string> = {
  TODO: 'To Do',
  IN_PROGRESS: 'In Progress',
  DONE: 'Done',
}

const priorityStyles: Record<string, string> = {
  LOW: 'text-emerald-400 bg-emerald-400/10',
  MED: 'text-amber-400 bg-amber-400/10',
  HIGH: 'text-red-400 bg-red-400/10',
}

export function TaskDataGrid() {
  // Shares SWR's '/api/tasks' cache key with KanbanBoard — no duplicate
  // network request, just a second reader of the same real data.
  const { data: tasks, isLoading } = useSWR<Task[]>('/api/tasks', fetcher)

  const data = useMemo(() => tasks ?? [], [tasks])

  const columns = useMemo(
    () => [
      {
        accessorKey: 'title',
        header: 'Task',
        cell: ({ row }: { row: { original: Task } }) => (
          <span className="font-medium text-white/90">{row.original.title}</span>
        ),
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }: { row: { original: Task } }) => (
          <span className="text-white/60">{statusLabels[row.original.status]}</span>
        ),
      },
      {
        accessorKey: 'priority',
        header: 'Priority',
        cell: ({ row }: { row: { original: Task } }) => (
          <span
            className={`rounded-md px-2 py-0.5 font-mono text-[10px] font-bold tracking-wide ${
              priorityStyles[row.original.priority]
            }`}
          >
            {row.original.priority}
          </span>
        ),
      },
      {
        id: 'assignee',
        accessorFn: (task: Task) => task.assignee?.name ?? 'Unassigned',
        header: 'Assignee',
        cell: ({ row }: { row: { original: Task } }) => (
          <span className="text-white/50">{row.original.assignee?.name ?? 'Unassigned'}</span>
        ),
      },
      {
        accessorKey: 'dueDate',
        header: 'Due',
        cell: ({ row }: { row: { original: Task } }) => (
          <span className="font-mono text-xs text-white/40">
            {row.original.dueDate
              ? new Date(row.original.dueDate).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                })
              : '—'}
          </span>
        ),
      },
    ],
    []
  )

  const table = useTable({
    features: dataGridFeatures,
    columns,
    data,
    getRowId: (task: Task) => task.id,
  })

  return (
    <DataGrid
      table={table}
      recordCount={data.length}
      isLoading={isLoading}
      loadingMode="skeleton"
      emptyMessage="No tasks yet."
      tableLayout={{ rowBorder: true, headerBackground: false }}
    >
      <DataGridContainer className="glass rounded-3xl border-white/5">
        <DataGridTable />
      </DataGridContainer>
    </DataGrid>
  )
}
