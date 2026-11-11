import { z } from 'zod';

export const createWorkspaceSchema = z.object({
  name: z.string().trim().min(1, "Vui lòng nhập tên không gian làm việc."),
  image: z.union([z.instanceof(File), z.string().transform((value) => (value === '' ? undefined : value))]).optional(),
});

export const updateWorkspaceSchema = z.object({
  name: z.string().trim().min(1, "Tên không gian làm việc phải có ít nhất 1 ký tự.").optional(),
  image: z.union([z.instanceof(File), z.string().transform((value) => (value === '' ? undefined : value))]).optional(),
});
