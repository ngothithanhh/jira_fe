import { z } from 'zod';

import { TaskStatus } from './types';

export const createTaskSchema = z.object({
  name: z.string().trim().min(1, "Vui lòng nhập tên công việc."),
  status: z.string().min(1, "Vui lòng chọn trạng thái công việc."),
  workspaceId: z.string().trim().min(1, "Vui lòng chọn không gian làm việc."),
  projectId: z.string().trim().min(1, "Vui lòng chọn dự án."),
  dueDate: z.coerce.date().optional(),
  assigneeId: z.string().trim().min(1, "Vui lòng chọn người phụ trách."),
  description: z.string().optional(),
  issueTypeId: z.string().min(1, "Vui lòng chọn loại công việc."),
  priority: z.string().min(1, "Vui lòng chọn mức độ ưu tiên."),
});
