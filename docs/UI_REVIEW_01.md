# Bản duyệt UI 01 — Backlog và sprint planning

Ngày kiểm tra: 12/11/2026. Thực hiện bởi agent chính, không dùng sub-agent.

## Mở bản chạy

```powershell
npm ci --ignore-scripts --legacy-peer-deps
npm run dev -- --hostname 127.0.0.1 --port 3100
```

- Preview: http://127.0.0.1:3100/ui-review/backlog
- Trang dùng API thật: `/projects/{projectId}/backlog`, cần đăng nhập như các trang dự án hiện tại.
- Có nút `Backlog & Sprint` ở trang project hiện có.
- Đặt `NEXT_PUBLIC_API_URL` nếu backend không ở `http://localhost:8080/api`.

Preview có banner dữ liệu mẫu. Tìm kiếm, lọc, modal, panel, reorder và thao tác sprint chỉ thay đổi state bộ nhớ; reload trả lại mẫu. Trang preview bị chặn bằng `notFound()` ở production, không trở thành chế độ mock của trang thật.

## Đã chọn và tích hợp

| Nguồn | Đã kiểm tra | Cách sử dụng |
|---|---|---|
| FE ngothithanhh/jira_fe, gốc 5a032c5 | Checkout riêng, npm ci, dev server và production build | Dùng lại React 18, Next 14, TanStack Query, Radix/shadcn, Tailwind và thư viện dnd hiện có |
| sanidhyy/jira-clone, 9e832a1 | Đã clone và đọc mã/manifest/LICENSE; chưa khởi chạy đầy đủ Appwrite | Đối chiếu component gốc cùng nền FE; không đưa auth/API Appwrite sang Spring |
| oldboyxx/jira_clone, 26a9e77 | Đã clone, cài client, chạy Webpack ở cổng 4101, compile thành công; mở trình duyệt nhưng API riêng chưa chạy nên không kiểm đầy đủ flow của app gốc | Tham khảo Sidebar, Issue row/card, IssueDetails. Viết lại bằng stack hiện tại, không kéo React 16/styled-components/Webpack 4 vào FE |
| Jira Scrum template | Đã xem screenshot chính thức trên trang Atlassian | Tham khảo nhóm sprint/backlog, thanh lọc và phân cấp thông tin; không bundle logo/code/screenshot Atlassian |

Các repo tham khảo ở `../ui-references/`. Server tham khảo đã dừng; FE preview giữ chạy ở 3100 để duyệt. Nguồn và giấy phép tại THIRD_PARTY_NOTICES.md.

## Chức năng trong đợt này

- Sidebar dự án và màn Backlog dùng chung cho preview/trang thật.
- Sprint ACTIVE/FUTURE, thu gọn nhóm, số việc/story points và tiến độ hoàn thành.
- Tìm theo mã/tên không phân biệt dấu, lọc người phụ trách/chưa phân công/chưa hoàn thành.
- Reorder toàn bộ nhóm, chuyển product↔sprint; khi lọc tắt kéo để tránh gửi scope thiếu.
- Tạo issue theo loại được cấu hình, tạo/start/complete sprint, chọn nơi nhận việc chưa xong.
- Panel xem chi tiết, sửa mô tả và story points.
- Trang thật dùng API trong `src/features/backlog/api.ts` và `backlog-connected.tsx`; optimistic reorder/move, khóa mutation, rollback/refetch và thông báo lỗi.

Không dùng chuỗi DELETE+POST để giả chuyển hai sprint nguyên tử. Người dùng đưa issue về product backlog rồi chọn sprint mới. Không có API giả hoặc fixture tự động thay thế khi backend lỗi.

## Kết quả kiểm tra

| Kiểm tra | Kết quả |
|---|---|
| `npm run test:planning` | 6/6 đạt, không skip; kiểm mapper/null/version, reorder đầy đủ scope, bất biến snapshot, move không mất/trùng issue |
| `tsc --noEmit --pretty false` | Đạt sau sửa 8 lỗi type có sẵn: kiểu danh sách project/member và title/description của modal |
| `npm run build` | Đạt, không bỏ qua typecheck/lint trong lệnh build |
| Production `/ui-review/backlog` | HTTP 404 |
| Production anonymous `/projects/1/backlog` | Chuyển về `/sign-in` |
| Trình duyệt | Tìm `bao cao` khớp issue có dấu; lọc chưa phân công đúng 2 mẫu; tạo issue, lưu story points, chuyển product vào sprint, reorder bằng bàn phím đã được quan sát |
| Mobile 390×844 | Không tràn ngang; menu mở/đóng được; có screenshot |
| `git diff --check` | Đạt |

Log ở outputs của workspace: `jira-fe-build.log`, `jira-fe-typecheck-final.log`, `jira-fe-dev.log`. Screenshot ở `outputs/fe-review/`.

Đã sửa handle button bị thư viện dnd chặn sự kiện bằng tùy chọn `disableInteractiveElementBlocking`; thao tác sắp xếp liên tục Space/Down/Space sau đó đã đổi đúng thứ tự. Các thao tác trong browser trên preview không phải bằng chứng đã ghi dữ liệu backend.

## Giới hạn và bước tiếp theo

- Chưa kiểm CRUD/sprint/order đầu cuối bằng tài khoản thật trên backend. Chat chính đang hoàn thiện backend độc lập; đợt này không sửa BE hoặc DB.
- Chưa tích hợp Board, Reports, quản trị/notification/comment/attachment; các mục chưa triển khai trên preview không giả có chức năng.
- Chưa kiểm mọi browser, tải lớn, mọi tổ hợp quyền hoặc trạng thái tùy chỉnh.
- Chờ người dùng duyệt/chỉnh sửa màn đầu tiên trước khi triển khai phần UI tiếp theo. Commit chỉ ở local, chưa push.
