> Tài liệu lịch sử của đợt UI. Giao diện đã hoàn thành và đang nối backend; nhiệm vụ mới/nhánh làm việc xem [REMOTE_COLLABORATION.md](REMOTE_COLLABORATION.md).

# Prompt giao việc cho agent mới — UI trước, BE sau

Bạn có thể gửi nguyên tài liệu này cho agent ở chat khác. Tài liệu chi tiết kèm nguồn: [UI_IMPLEMENTATION_HANDOFF.md](UI_IMPLEMENTATION_HANDOFF.md). Bản ngắn trước đó: [UI_FIRST_PLAN.md](UI_FIRST_PLAN.md).

## Nhiệm vụ

Tiếp tục hoàn thiện giao diện **Hệ thống quản lý dự án**, tiếng Việt, phong cách Jira gọn như backlog hiện có. Làm UI và tương tác với dữ liệu mẫu trước; nối BE là giai đoạn sau.

Yêu cầu trực tiếp của người dùng: “giao diện trước đi, nối be để sau”. Cần màn hình cho đủ 19 nhóm UC, danh sách ở mục 3 của tài liệu chi tiết. Không chỉ dựng màn tĩnh: nút/form/modal/kéo thả/tìm kiếm/phân trang phải hoạt động trên state demo chung.

## Nơi làm việc

- FE: C:/Users/Admin/Documents/Codex/2026-08-27/https-github-com-ngothithanhh-jira-https/work/jira_fe
- Workspace: C:/Users/Admin/Documents/Codex/2026-08-27/https-github-com-ngothithanhh-jira-https
- FE origin: https://github.com/ngothithanhh/jira_fe.git
- BE nằm ở work/jira; chỉ đọc docs nghiệp vụ khi cần, không sửa Java/DB/API trong đợt UI.
- Agent chính tự làm, **không gọi sub-agent**. Không push/deploy khi chưa được yêu cầu.

## Việc đầu tiên phải đọc và kiểm tra

1. Đọc toàn bộ UI_IMPLEMENTATION_HANDOFF.md, nhất là mục 1–2 về thay đổi chưa commit và nguồn trích dẫn.
2. Chạy git status --short; không reset/restore hoặc ghi đè code chưa commit. Có thay đổi dở ở backlog-preview/backlog-view/planning-shell/model và các file ReviewProvider/planning-parts/layout.
   Nếu dùng checkout khác, cần snapshot các thay đổi này; clone riêng HEAD không có đầy đủ source đã được mô tả. Tên file/export và nguồn đã ghi trong handoff để đối chiếu.
3. Đọc các export hiện có: PlanningShell, BacklogView, BacklogPreview, ReviewProvider/useReview, PlanningActions và các helper trong model.ts. Link file/dòng được ghi ở phần nguồn của handoff.
4. Xác định người dùng đã duyệt plan nào. Quy trình AGENTS.md người dùng gửi yêu cầu chốt plan trước code; yêu cầu viết tài liệu bàn giao không tự thay cho phê duyệt triển khai. Nếu chưa duyệt, trình plan đợt 1 cụ thể trước khi sửa.
5. Giữ quy chuẩn thiết kế: header 56px, sidebar 240px, nền trắng/xám, primary #0052cc, button bo nhỏ, hàng issue gọn, không gradient/hero/slogan.

## Hướng triển khai đã đề xuất

- Mở rộng bộ route /ui-review ở development. Giữ production guard; auth demo có layout riêng không sidebar. Bản demo deployable cần được người dùng chốt riêng.
- Tách state khỏi shell. Một DemoProvider/useReducer chứa dữ liệu chuẩn hóa: project, issue, sprint, board/column, member, catalog, comment/attachment, inbox/audit, snapshot report.
- Một issue chỉ có một bản ghi nguồn; dùng selector và adapter sang PlanningData để giữ BacklogView cũ. Không giữ hai useState tách rời cho cùng dữ liệu.
- Không import apiClient/BacklogConnected/các use-* API hook vào cây demo. Không yêu cầu Spring Boot chạy để xem UI.
- Các action demo kiểm ID/project/role, validate trước update, lỗi giữ draft/state cũ. Dùng category DONE thay vì suy từ tên; không gán cứng status ID.
- Refresh/reset đưa về fixture; không lưu mật khẩu/token thật hoặc toàn bộ state demo vào localStorage.
- Comment/attachment/notification/report/admin phải dùng cùng dữ liệu mẫu, không mỗi màn một mock độc lập.
- Tái dùng Radix/components/UI hiện có, ghi comment tiếng Việt ở transition/validation chính. Giữ THIRD_PARTY_NOTICES.md.
- Nguồn Jira bên ngoài chỉ tham khảo tương tác; quy tắc sản phẩm theo docs nghiệp vụ repo, tránh copy khác biệt của Jira.

## Thứ tự thực hiện

1. Shell + state + project list/overview.
2. Backlog/sprint + board + issues/detail panel.
3. Comment/attachment + members + project/board/column settings.
4. Notification + report chart.
5. Sign-in/sign-up/profile + khu admin.
6. Responsive, loading/empty/error/403/404, keyboard, test và ảnh bàn giao.

Mỗi đợt có kiểm tra và commit riêng; chỉ stage file thuộc scope đã hoàn tất. Đừng tạo lại toàn bộ app hoặc tự nâng framework.

## Kiểm tra và báo cáo

Trong repo FE:
~~~powershell
node node_modules/typescript/bin/tsc --noEmit --incremental false
npm run test:planning
npm run build
npm run dev -- --hostname 127.0.0.1 --port 3100
~~~

Mở http://127.0.0.1:3100/ui-review/backlog. Trang review development không xem bằng next start production.

Baseline khảo sát: typecheck/build đạt, 6 planning-model test đạt; npm run lint độc lập chưa được cấu hình và đã dừng ở prompt, không báo đã lint pass. Agent phải chạy lại sau thay đổi của mình.

Bổ sung test transition có ý nghĩa và kiểm browser nếu có tool. Kiểm desktop 1440×900, mobile 390×844 và các điểm giữa. Đặc biệt kiểm một thay đổi issue phản ánh ở board/list/detail, filtered reorder không mất issue, CLOSED giữ history, snapshot velocity không bị sửa ngược, inbox theo persona, giữ admin cuối và tối đa một PM trong project mẫu.

Khi kết thúc mỗi đợt, báo route mở, commit, lệnh thực chạy, lỗi đã xử lý và giới hạn. Lưu docs/UI_DELIVERY.md và ảnh mới theo đúng commit. Không dùng ảnh/test cũ để báo bản mới đã được kiểm; không gọi state demo là tích hợp backend thật.

**Kết quả cuối cần đạt:** đủ giao diện 19 nhóm UC, điều hướng trọn vẹn, form/action bấm được với state mẫu nhất quán, responsive và có bằng chứng duyệt; danh sách việc nối BE được để riêng cho giai đoạn sau.
