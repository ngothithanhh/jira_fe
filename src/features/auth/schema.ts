import { z } from 'zod';

export const signInFormSchema = z.object({
  email: z.string().trim().email({
    message: "Địa chỉ email không hợp lệ.",
  }),
  password: z.string({
    required_error: "Vui lòng nhập mật khẩu.",
  }).min(1, "Vui lòng nhập mật khẩu."),
});

export const signUpFormSchema = z.object({
  name: z.string().trim().min(1, "Vui lòng nhập họ và tên."),
  email: z.string().trim().min(1, "Vui lòng nhập email.").email({
    message: "Địa chỉ email không hợp lệ.",
  }),
  password: z.string().min(8, "Mật khẩu phải có ít nhất 8 ký tự.").max(256, "Mật khẩu không được vượt quá 256 ký tự."),
});
