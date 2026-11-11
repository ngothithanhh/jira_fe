import { z } from 'zod';

export const createProjectSchema = z.object({
  name: z.string().trim().min(1, "Vui lòng nhập tên dự án."),
  image: z.union([z.instanceof(File), z.string().transform((value) => (value === '' ? undefined : value))]).optional(),
  workspaceId: z.string({
    message: "Vui lòng chọn không gian làm việc.",
  }),
});

export const updateProjectSchema = z.object({
  name: z.string().trim().min(1, "Vui lòng nhập tên dự án.").optional(),
  image: z.union([z.instanceof(File), z.string().transform((value) => (value === '' ? undefined : value))]).optional(),
  workspaceId: z.string({
    message: "Vui lòng chọn không gian làm việc.",
  }),
});
