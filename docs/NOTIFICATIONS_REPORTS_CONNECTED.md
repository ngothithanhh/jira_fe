# Thông báo và Báo cáo Scrum

Bản ghép ngày 12/11/2026 nối các commit FE `920f2b3`, `0570367`, `d1e9743`, `9abde88` vào nền `f843521`. Giữ các luồng project, thành viên, issue/backlog và Scrum board đã nối trước đó. Backend dùng `bd1b4b5`, không đổi code hoặc schema trong đợt này. Không ghép nhánh master hoặc account-profile chưa bàn giao.

## Luồng và dữ liệu

Browser → BFF `/api/backend` cùng origin → Spring Boot `/api` → PostgreSQL. Token ở cookie HttpOnly; client không gửi userId để chọn hộp thư.

| Chức năng | API Spring Boot | Dữ liệu/quyền |
|---|---|---|
| Hộp thư | GET `/api/notifications?unreadOnly=true\|false` | Chỉ notifications của người nhận trong JWT |
| Badge chưa đọc | GET `/api/notifications/unread-count` | Đếm cùng người nhận với hộp thư |
| Đọc một/tất cả | PUT `/api/notifications/{notificationId}/read`, PUT `/api/notifications/read-all` | Chỉ đổi trạng thái đọc; BE kiểm người nhận |
| Xóa | DELETE `/api/notifications/{notificationId}` | Chỉ xóa notification thuộc người gọi |
| Danh sách sprint | GET `/api/sprints/project/{projectId}` | Selector báo cáo chỉ chọn ACTIVE/CLOSED thuộc dự án |
| Tổng kết | GET `/api/sprints/{sprintId}/reports/summary` | Phân biệt số liệu hiện tại với commitment/completed snapshot |
| Burndown | GET `/api/sprints/{sprintId}/reports/burndown` | Vẽ bậc thang theo thời điểm event thật |
| Velocity | GET `/api/projects/{projectId}/reports/velocity?limit=10` | Sprint CLOSED, điểm đã chốt; limit từ 1 đến 50 |

notificationId là khóa notification, projectId là khóa projects, sprintId là khóa sprints. BFF chặn ID không hợp lệ, method/path/query ngoài allowlist và query trùng; BE kiểm quyền đọc dự án/sprint. Sai sprint trên URL không tự chuyển sang dữ liệu của sprint khác.

Mỗi lần ghi thông báo dùng khóa phiên và kiểm actor trước dispatch. Không tự gửi lại mutation. Sau phản hồi thành công, cache hộp thư/badge của actor được đánh stale kể cả khi đã rời trang; việc tải lại vẫn kiểm phiên. Phản hồi cũ không cập nhật UI tài khoản mới. Nếu đã ghi nhưng chưa xác nhận được phiên, thông báo kết quả chưa chắc chắn và yêu cầu tải lại thay vì mở gửi lại âm thầm.

Lỗi tải số chưa đọc không hiển thị số 0 giả; lỗi danh sách không trở thành hộp thư rỗng. Báo cáo thiếu snapshot hiển thị chưa có dữ liệu, không lấy tổng điểm hiện tại thay lịch sử, không tự thêm đường burndown lý tưởng. Sửa estimate của issue sau khi đóng sprint không đổi completed snapshot.

Đổi issue/sprint làm stale cache báo cáo của dự án và thông báo của actor theo luồng chung. Chưa có WebSocket/polling; thông báo do người khác tạo được tải lại khi refocus hoặc tải lại trang.

## Kiểm tra bằng tay trên máy chính

Preview FE đang dùng `http://127.0.0.1:3130`, BE `http://127.0.0.1:8080`, DB riêng `jira_demo_ready` với schema validate. Cấu hình chạy xem [CONNECTED_PART1.md](CONNECTED_PART1.md).

1. Đăng nhập `nr-recipient@example.test`. Mật khẩu nằm trong file local `outputs/backend-integration/notifications-reports/credentials.local.json` ở workspace cha, không nằm trong Git. Có thể dùng admin demo để xem báo cáo nhưng hộp thư admin khác hộp thư người nhận này.
2. Bấm chuông hoặc mở `/app/notifications`. Chọn Chưa đọc → đánh dấu một thông báo đã đọc → kiểm badge giảm và dòng biến mất khỏi bộ lọc. Chuyển Tất cả, xóa một dòng; thử Đánh dấu tất cả đã đọc và F5 để kiểm lưu thật.
3. Mở `/app/projects/21/reports?tab=summary&sprintId=18` hoặc vào dự án NRREPORTS → Báo cáo Scrum → chọn sprint kiểm thử mới nhất. Đây là dữ liệu mô phỏng được tạo qua API, không phải lịch sử sản phẩm thật. Commitment 10 điểm, completed snapshot 3 điểm; scope từng tăng lên 13 điểm.
4. Chuyển Burndown: xem các event khởi tạo/thay estimate/chuyển Done/đóng sprint. Chuyển Velocity: đối chiếu commitment 10 và completed 3 của sprint vừa tạo. F5 giữ lựa chọn theo URL. Dự án SHOP có thể chưa có sprint CLOSED nên Velocity trống là đúng dữ liệu.
5. Đăng nhập outsider và mở cùng URL để kiểm bị chặn. Thử đổi tài khoản ở tab khác, quay lại tab cũ để kiểm dữ liệu phiên trước được xóa. Mobile phải cuộn biểu đồ bên trong khung trang.

Dữ liệu demo được chuẩn bị lại sau khi test để còn thông báo chưa đọc cho kiểm tra bằng tay. Các ID trên là dữ liệu local lúc bàn giao, không áp dụng cho máy khác. Không sửa issue/board/membership SHOP; sau dọn fixture hồi quy, SHOP vẫn có 9 issue, 1 board và 4 issue trong sprint ACTIVE.

## Kiểm chứng đã chạy

- 105 FE unit đạt: 81 connected, 6 planning, 18 UI model. TypeScript và production build đạt.
- 27 BE test được chọn trong ScrumReportRegressionTest và CollaborationAdminRegressionTest đạt. Không chạy lại toàn bộ backend trong đợt này.
- 8 nhóm browser mới trên FE production + BE/PostgreSQL thật đạt: rời Inbox khi write đang hoàn tất; badge/filter/read/delete/read-all/F5/double click; lỗi count/list và retry; queued/late identity switch; quyền người nhận; đối chiếu summary/burndown/velocity; sửa CLOSED issue không đổi snapshot; mobile/outsider/foreign sprint.
- Trường hợp thiếu lịch sử và một số lỗi HTTP được chèn bằng Playwright route để kiểm UI, không phải chứng minh DB đã có mọi dạng dữ liệu cũ. Các kiểm chứng thông thường và quyền dùng API/DB thật.
- Hồi quy browser chạy lại đạt: 13 auth + 11 project + 15 issue/backlog + 13 board = 52 nhóm, cùng suite thành viên Chromium. Hai chỉnh harness chờ request nền của chuông kết thúc, không đổi logic auth/board.
- Một reviewer độc lập chỉ đọc đã kiểm 10 tiêu chí AGENTS, không còn finding mở trong phạm vi. Đã sửa trường hợp rời Inbox sau commit khiến badge còn cũ. Kết quả chạy test do agent chính thực hiện; review không phải một lượt chạy DB/API độc lập.
- Log/ảnh/file credential ở `outputs/backend-integration/notifications-reports` ngoài Git. Không cam kết mọi interleaving, tải lớn hoặc toàn bộ chức năng hệ thống từ các kết quả trên.

## Chạy lại

Trong repo FE với Node 24:

```powershell
npm run test:connected
npm run test:planning
npm run test:ui-demo
npx tsc --noEmit
$env:NEXT_DIST_DIR='.next-connected-build'
npm run build
```

Browser test `npm run test:notifications-reports:browser` cần FE/BE/DB test đang chạy, Playwright và Chromium. Đặt `NR_CREDENTIALS` trỏ đến JSON local; `NR_OUTPUT` là thư mục ghi log/ảnh. Có thể đặt `PLAYWRIGHT_MODULE` và `CHROMIUM_PATH` nếu dùng runtime sẵn có.

Fixture JSON gồm origin, projectId, sprintId, admin/recipient/other (email/password, recipient/other có id), otherNotificationId và expected (commitment/completed/events). Chuẩn bị bằng API: recipient có ít nhất 4 thông báo chưa đọc để sau hai lượt đọc và một lượt xóa vẫn còn mục cho read-all; otherNotificationId thuộc người nhận khác; sprint CLOSED có commitment 10, completed 3 và ít nhất 4 burndown event. Chỉ dùng project/tài khoản riêng cho kiểm thử vì script đọc/xóa thông báo, đổi estimate một issue CLOSED và kiểm đổi phiên. Không dùng tài khoản/hộp thư thật. Sau chạy cần tạo lại thông báo để chạy lần nữa.

Trong repo BE: `./mvnw.cmd '-Dtest=ScrumReportRegressionTest,CollaborationAdminRegressionTest' test` bằng JDK 17. Đây là nhóm regression được chọn; browser mới là phần kiểm tích hợp qua HTTP với PostgreSQL demo đang chạy.
