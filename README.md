# Hệ thống quản lý dự án — Frontend

Source giao diện đầy đủ và phần 1 nối backend nằm trên nhánh `feat/backlog-ui-review`.

- [Bàn giao làm trên hai máy / prompt cho agent backend](docs/REMOTE_COLLABORATION.md)
- [Phần 1 đã nối: cấu hình, kiểm thử và luồng kiểm tra](docs/CONNECTED_PART1.md)
- [Plan tích hợp theo từng phần](docs/BACKEND_INTEGRATION_PLAN.md)
- Backend tương ứng: [ngothithanhh/jira — feat/backend-integration](https://github.com/ngothithanhh/jira/tree/feat/backend-integration).

Ứng dụng thật: `/app/sign-in`; preview fixture: `/ui-review/projects` (chỉ development). Git không chứa DB/credential cá nhân. Phần hướng dẫn Next.js gốc dưới đây là tham khảo; đọc các tài liệu trên để chạy đúng ứng dụng.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
