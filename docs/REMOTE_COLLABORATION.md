# Hai máy cùng nối FE–BE theo nhóm chức năng

> **Nhiệm vụ mới sau Notification/Reports:** [NEXT_REMOTE_TASKS.md](NEXT_REMOTE_TASKS.md) — C1 thành viên dự án, C2 profile/password. Các đoạn B1/B2 dưới đây là lịch sử bàn giao đã xong, không giao lại.

Cập nhật yêu cầu mới: **“bên kia cũng nối fe be đi cho nhanh”**. Phân công này thay thế nhiệm vụ trước chỉ làm BE/reconcile/dataset.

> Phần project 2A đã bổ sung transport protected mutation/response rỗng và project gate/layout. Trước patch B0 hãy fetch nền mới, đọc [CONNECTED_PROJECTS.md](CONNECTED_PROJECTS.md), đặc biệt mục điều phối; không ghi đè server.ts/client.ts/shell.tsx bằng source phần1. Notification/Reports vẫn thuộc máy kia.

| Máy | Phạm vi vòng đầu |
|---|---|
| Máy hiện tại | Project, issue/detail/comment/attachment, backlog, sprint/board từ FE tới BE; giữ auth/session/query lifecycle/BFF/shell chung. |
| Máy kia | B1 Notification, B2 Báo cáo Scrum từ FE tới BE/DB, tự chuẩn bị dữ liệu nhỏ và test thật. Sau mỗi phần báo người dùng kiểm rồi dừng. |

Không bắt máy kia chờ hợp nhất toàn bộ master BE hoặc full dataset. Cả hai dùng BE feat/backend-integration và FE feat/backlog-ui-review đã có phần 1; không tự merge master đang phát triển riêng.

**[Tài liệu đầy đủ: file sở hữu, API, B0/B1/B2 và test](https://github.com/ngothithanhh/jira/blob/feat/backend-integration/docs/REMOTE_COLLABORATION.md).**

## Prompt gửi agent kia

```text
Bạn làm fullstack Notification và Báo cáo Scrum trên máy riêng.
Clone jira nhánh feat/backend-integration và jira_fe nhánh feat/backlog-ui-review vào hai thư mục cạnh nhau. Đọc BE docs/REMOTE_COLLABORATION.md.
Nhiệm vụ mới thay thế phân công chỉ làm BE/reconcile/dataset; không chờ và không tự merge master.
Tạo work/notifications ở cả hai repo. Đọc code và trình plan B0/B1 cụ thể để người dùng chốt trước khi code.
B0: BFF hiện chưa cho notification/report qua; tách patch server.ts allowlist/Bearer/Origin/response rỗng thành commit nhỏ riêng, gửi owner ghép/test trước. Không viết lại proxy hoặc auth.
B1: nối trang/bell Notification với API và PostgreSQL thật, inbox/unread/mark-one/mark-all/delete, quyền recipient/cache theo user. Tự test HTTP/browser, commit/push FE+BE liên quan, gửi SHA, URL và luồng kiểm rồi dừng.
Sau B1 được kiểm, fetch nền mới, tạo work/scrum-reports và lập plan B2: project/sprint selector, summary, burndown event, velocity snapshot, null/unavailable và quyền project. Dữ liệu từ BE, không dùng fixture/số trang trí trong FE.
Bạn sở hữu features/connected/notifications/**, reports/** và pages notification/report; BE chỉ sửa domain tương ứng khi plan cần.
Shared auth/client/session/BFF/shell/kit/package/config và core project/issue/sprint/board không sửa lẫn feature. Menu/bell hoặc BFF wiring tách commit nhỏ để owner ghép/test.
Không làm admin/members/full dataset hoặc tự đổi contract/migration cũ. Mỗi phần test xong phải báo luồng người dùng kiểm và chờ phản hồi.
```

## File và luồng cần nối

- Pages: app/app/(protected)/notifications/page.tsx và app/app/(protected)/projects/[projectId]/reports/page.tsx.
- Code mới: src/features/connected/notifications/**, reports/** cùng tests/docs domain riêng.
- Dùng connectedRequest và session/query provider chung; key bắt đầu connected và có user/project/sprint cần thiết. Không dùng DemoProvider hoặc localStorage token.
- UI tham khảo: ui-demo/screens/notifications-screen.tsx, reports-screen.tsx, charts.tsx; tách phần trình bày, không sửa fixture để giả thành API thật.
- Notification DTO hiện không có projectId; không đoán ID/link issue. Mark-one-read trả 200 rỗng, delete 204; patch BFF phải xử lý đúng trước khi dựng feature.
- Reports dùng sprint đúng project, step/event burndown và CLOSED snapshot; null/unavailable không đổi thành 0. API đọc/đơn vị/quyền theo tài liệu BE.
- BFF/menu/bell chung do owner ghép patch nhỏ, chỉ một bên sửa ở mỗi thời điểm. Sau B0, pages/domain có thể làm và test trực tiếp qua URL dù chưa có menu.

[CONNECTED_PART1.md](CONNECTED_PART1.md) mô tả phần auth/account/list project đã nối. Các prompt UI cũ là lịch sử; DB/credential/log ở máy gốc không có trong Git.
