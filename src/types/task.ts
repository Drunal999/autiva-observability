export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'DONE'
export type Priority = 'LOW' | 'MED' | 'HIGH'

export interface TaskAssignee {
  id: string
  name: string
  avatarUrl: string | null
}

export interface Task {
  id: string
  title: string
  description: string | null
  status: TaskStatus
  priority: Priority
  assignee: TaskAssignee | null
  assigneeId: string | null
  dueDate: string | null
  overdueFlaggedAt: string | null
  lastStatusChangeAt: string
  createdAt: string
  updatedAt: string
}

export interface CreateTaskInput {
  title: string
  description?: string
  assigneeId?: string
  dueDate?: string
  priority?: Priority
}

export interface UpdateTaskInput {
  title?: string
  description?: string
  status?: TaskStatus
  assigneeId?: string | null
  dueDate?: string | null
  priority?: Priority
}
