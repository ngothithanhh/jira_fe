# Thành viên dự án

Mở **Thành viên** từ thanh điều hướng dự án hoặc vào /app/projects/{projectId}/members. Trang dùng ProjectGate để tải quyền theo dự án. Lead lấy từ chi tiết dự án. Số thành viên đếm các dòng trong project_members.

| API | Quyền | Hợp đồng |
|---|---|---|
| GET /api/projects/{projectId}/members | VIEW_PROJECT | Danh sách thành viên và thời điểm tham gia |
| GET /api/user-role | Phiên đăng nhập | Trường role là ID của user_roles. Form chỉ dùng danh mục khi có ADD_MEMBER |
| POST /api/projects/{projectId}/members/candidates/search | ADD_MEMBER | Body {email}. Trả danh sách có tối đa một ứng viên gồm userId, userName, fullName |
| POST /api/projects/{projectId}/members | ADD_MEMBER | Body {userId, roleId}. Trả 200 rỗng |
| PUT /api/projects/{projectId}/members/{userId}/role | ADD_MEMBER | Body {roleId}. Trả 204 |
| DELETE /api/projects/{projectId}/members/{userId} | DELETE_MEMBER | Trả 200 rỗng |

Tra cứu dùng đúng email đã đăng ký sau khi bỏ khoảng trắng ở hai đầu. Kết quả rỗng cho tài khoản không tồn tại, bị vô hiệu hóa hoặc đã thuộc dự án. Mỗi thao tác ghi kiểm quyền lần nữa sau khi lấy khóa hàng projects. Thêm thành viên ghi audit và notification trong cùng transaction. Đổi role giữ assignedAt. Dữ liệu vai trò toàn cục nằm ở user_role_assignments.

Bản tích hợp với Scrum board làm mới membership của chính actor sau khóa projects và trước kiểm quyền. Điều này cần thiết khi controller/OEIV đã nạp role cũ trong EntityManager: query lại không tự refresh entity đó. Không dùng membership của người được thêm/gỡ để kiểm quyền người gọi.

Sau ghi thành công, FE làm mới danh sách thành viên, kết quả tra cứu, tham chiếu assignee và chi tiết/danh sách dự án theo ID actor. Chi tiết tải lại context quyền và memberCount. Callback hoàn tất dùng cùng scope và actor với thao tác ghi.

Nếu backend đã xác nhận ghi nhưng probe completion lỗi, FE đánh cache liên quan stale, báo kết quả đã lưu và khóa gửi lại đến khi tải lại trang. Không tự refetch bằng cookie có thể thuộc người khác. Lỗi gate khi form thêm đang mở giữ email/role/candidate, khóa nút thêm và có nút Tải lại dự án ngay trong modal; Hủy vẫn dùng được.

## Kiểm thử

Chạy nhóm test FE có BFF giả lập bằng Node 24.

    node --test tests/connected-server.test.mjs tests/connected-client.test.mjs tests/connected-projects.test.mjs tests/connected-issues.test.mjs tests/connected-members.test.mjs tests/planning-model.test.mjs tests/ui-demo-model.test.mjs
    npm run build

Chạy test BE và đóng gói JAR trong repo backend.

    mvn package

Script tests/connected-members.browser.cjs cần FE, Spring Boot và PostgreSQL test đang chạy. Đặt C1_CREDENTIALS tới JSON local chứa origin, projectId, pm, developer, outsider, browser và roles. Mỗi tài khoản chứa email/password. roles chứa ID developer, scrum và manager từ API danh mục. Dự án test có đúng hai membership PM và developer. Tài khoản browser có tên hiển thị C1 Browser và chưa thuộc dự án. Đặt PLAYWRIGHT_MODULE hoặc CHROMIUM_PATH khi dùng Chromium có sẵn trên máy.

    node tests/connected-members.browser.cjs

Để kiểm bằng tay, đăng nhập PM, vào Thành viên, tra email ứng viên, chọn DEVELOPER và thêm. Sau F5, mở Tổng quan để đối chiếu số thành viên. Đổi sang SCRUM_MASTER, F5 và kiểm ngày tham gia giữ nguyên. Gỡ qua hộp xác nhận rồi kiểm số thành viên giảm. Đăng nhập developer để kiểm chế độ chỉ đọc. Mở cùng URL bằng outsider để kiểm gate từ chối truy cập.

## Kết quả ghép tại máy chính — 12/11/2026

- Đã ghép C1 FE d50f495 và BE401bf66 vào nền FE e0e3e5a / BE2c18460 bằng merge giữ lịch sử. Hòa giải hai file server.ts và projects/screens.tsx, giữ cả Scrum board và Thành viên; không ghép account-profile, notifications hay reports.
- Mở http://127.0.0.1:3130/app/projects/1/members. Tài khoản PM/dev như phần trước, mật khẩu local ngoài Git. Có ứng viên demo `c1-browser@example.test` (C1 Browser) để thử thêm vào SHOP; sau kiểm có thể gỡ. Bài test tự động dùng project C1 riêng và project hồi quy riêng, không sửa issue/board/membership SHOP.
- 101 FE unit (77 connected +6 planning +18 UI model), 390 BE unit và 58 PostgreSQL integration đạt; TypeScript và production build đạt, không fail/error/skip.
- Ba case PostgreSQL mới dùng ProjectSecurity thật: persistence context đã nạp role cũ, transaction độc lập thu hồi role, add/role/remove phải từ chối. Đã tái hiện cả ba fail trên bản trước sửa, pass sau refresh actor. Test không được diễn giải thành HTTP/OEIV concurrency đầy đủ hoặc benchmark.
- Browser C1 đạt: nav/filter/exact lookup, network error giữ draft, double submit, add/role/remove, F5/count/assignedAt, mobile, lookup bị chặn/trùng membership/PM thứ hai/SYSTEM_ADMIN/lead, gate503 giữ draft/retry trong modal, commit rồi probe503 khóa resubmit, queued identity switch, late response, readonly và outsider.
- Hồi quy browser bản ghép: 13 auth +11 project +15 issue/backlog +13 board =52 nhóm đạt. Các bộ này chạy trước tiny UI patch chỉ thêm nút retry trong modal C1; browser C1 và production build chạy lại sau patch.
- Review độc lập chỉ đọc theo 10 tiêu chí AGENTS đã hoàn tất, không còn finding mở trong phạm vi. Đã sửa quyền cũ trong EntityManager, completion probe lỗi sau commit và gate lỗi làm mất draft. Kết quả test do agent chính chạy; reviewer chỉ đọc.
- Artifacts/log/credential ở outputs/backend-integration/members-merge ngoài Git. Secret scan và diff check đạt. Không đổi schema; preview dùng DB jira_demo_ready với validate. Không bảo đảm mọi interleaving/tải lớn ngoài các kịch bản đã chạy.
