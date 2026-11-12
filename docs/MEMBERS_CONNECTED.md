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

Sau ghi thành công, FE làm mới danh sách thành viên, kết quả tra cứu, tham chiếu assignee và chi tiết/danh sách dự án theo ID actor. Chi tiết tải lại context quyền và memberCount. Callback hoàn tất dùng cùng scope và actor với thao tác ghi.

## Kiểm thử

Chạy nhóm test FE có BFF giả lập bằng Node 24.

    node --test tests/connected-server.test.mjs tests/connected-client.test.mjs tests/connected-projects.test.mjs tests/connected-issues.test.mjs tests/connected-members.test.mjs tests/planning-model.test.mjs tests/ui-demo-model.test.mjs
    npm run build

Chạy test BE và đóng gói JAR trong repo backend.

    mvn package

Script tests/connected-members.browser.cjs cần FE, Spring Boot và PostgreSQL test đang chạy. Đặt C1_CREDENTIALS tới JSON local chứa origin, projectId, pm, developer, outsider, browser và roles. Mỗi tài khoản chứa email/password. roles chứa ID developer, scrum và manager từ API danh mục. Dự án test có đúng hai membership PM và developer. Tài khoản browser có tên hiển thị C1 Browser và chưa thuộc dự án. Đặt PLAYWRIGHT_MODULE hoặc CHROMIUM_PATH khi dùng Chromium có sẵn trên máy.

    node tests/connected-members.browser.cjs

Để kiểm bằng tay, đăng nhập PM, vào Thành viên, tra email ứng viên, chọn DEVELOPER và thêm. Sau F5, mở Tổng quan để đối chiếu số thành viên. Đổi sang SCRUM_MASTER, F5 và kiểm ngày tham gia giữ nguyên. Gỡ qua hộp xác nhận rồi kiểm số thành viên giảm. Đăng nhập developer để kiểm chế độ chỉ đọc. Mở cùng URL bằng outsider để kiểm gate từ chối truy cập.
