# Role R1 và tự tạo project P1

## Phạm vi đã nối

Trang /app/admin/roles giữ shell/header/sidebar hiện có, đọc danh sách role/count và danh mục permission thật.
Admin tạo, đổi tên, xóa custom role; bốn role mặc định được bảo vệ. Scope là metadata backend: SYSTEM_ADMIN = Hệ thống, các role khác = Dự án.
Số assignment global và membership hiển thị riêng. Global legacy của role dự án có cảnh báo; gỡ tại trang Người dùng. Trang đó chỉ cho cấp SYSTEM_ADMIN.
Danh mục permission chỉ xem; custom role mới chưa có quyền ghi, membership vẫn được VIEW_PROJECT. R2 chỉnh ma trận chưa thực hiện.
User thường có nút Tạo dự án, trở thành lead và PROJECT_MANAGER trong project mới. Chỉ chủ/SYSTEM_ADMIN có nút xóa, không được xóa khi còn dữ liệu phụ thuộc/thành viên khác chủ.

## Các luồng kiểm tra

### 1. User thường tạo và quản lý project

1. Mở /app/sign-in, đăng nhập user thường hoặc đăng ký tài khoản mới.
2. Vào /app/projects → Tạo dự án, nhập tên và mã chưa trùng.
3. Mở Thành viên: người tạo có role PROJECT_MANAGER và là trưởng dự án; thống kê thành viên=1.
4. Sửa tên/mô tả, thêm tài khoản đã đăng ký với SCRUM_MASTER, DEVELOPER hoặc custom role.
5. Đăng nhập người vừa thêm: thấy project đó, thao tác theo quyền. User không được thêm không đọc/sửa/xóa được khi nhập URL trực tiếp.
6. User thường vào /app/admin/roles hoặc /app/admin/users bị chặn dù đang là lead.
7. Trên project thử nghiệm rỗng: Cài đặt → Xóa dự án → nhập đúng mã → xóa thành công. Nếu còn thành viên khác hoặc issue/board/sprint, nhận lỗi409 và dữ liệu vẫn còn.

### 2. Admin quản lý role

1. Đăng nhập SYSTEM_ADMIN → Cấu hình hệ thống → Vai trò & quyền (/app/admin/roles).
2. Xem phạm vi và hai số đếm; bốn role mặc định không có thao tác đổi tên/xóa.
3. Tạo role REVIEWER (hoặc mã mới), kiểm chữ hoa chuẩn hóa. Tạo trùng sẽ báo xung đột.
4. Đổi tên custom: ID, membership và quyền đã gán vẫn giữ nguyên.
5. Gán custom cho một thành viên project rồi thử xóa role:409, không gỡ thành viên.
6. Đổi thành viên sang role khác, quay lại xóa custom chưa được dùng: thành công.
7. Danh mục quyền chỉ đọc; không có nút Lưu ma trận trong R1.

### 3. Phạm vi role global

1. Trang Người dùng → Chi tiết: chỉ có Gán SYSTEM_ADMIN.
2. Role dự án đã gán global từ dữ liệu cũ hiện nhãn legacy/không cấp quyền toàn cục và nút Gỡ.
3. Gỡ global legacy không làm mất role trong project; role project quản lý tại Thành viên.
4. Lead giữ ownership khi đổi role membership; chưa có chức năng chuyển chủ project.

## Phiên và lỗi

BFF chỉ whitelist CRUD role/catalog; Origin, ID, query và body được kiểm trước dispatch. Cookie HttpOnly giữ token ngoài JS.
Đọc dưới khóa phiên; mutation recheck actor/admin gate sau chờ khóa. Dùng lại useAdminUserWrite với domain admin-roles, không dùng nhánh tự khóa tài khoản.
Sau ghi đánh stale các query thuộc actor và refetch khi probe cookie đúng actor. Phản hồi tài khoản cũ không hoàn tất form/cache tài khoản mới.
Mất response/5xx hoặc không xác nhận được refetch: giữ uncertainty latch qua đóng form/rời trang, không gửi lại tự động; reload để đối chiếu DB.
403/409 giữ draft và báo lỗi. Lỗi đọc có Thử lại; không giả danh sách rỗng khi API hỏng.

## Kiểm thử và giới hạn

Kết quả bàn giao: FE148 test pass, production build pass; BE clean verify416 unit +82 integration PostgreSQL/HTTP pass. Browser R1/P1 có10 nhóm, admin-users12 nhóm, configuration15 nhóm pass;8 suite hồi quy auth/project/issue/board/member/notification-report/account/collaboration pass. Review độc lập hoàn tất, không còn finding mở.

Chạy npm run test:connected cùng test planning/ui-demo; npm run build.
Browser suites tests/connected-admin-roles.browser.cjs, tests/connected-admin-users.browser.cjs và tests/connected-projects.browser.cjs dùng tài khoản/dữ liệu riêng.
Truyền ROLES_CREDENTIALS/ROLES_OUTPUT, ADMIN_USERS_CREDENTIALS/ADMIN_USERS_OUTPUT, CONNECTED_CREDENTIALS/CONNECTED_URL/CONNECTED_OUTPUT qua biến môi trường. Không commit credential hoặc evidence chứa dữ liệu phiên.
BE tests/migration xem docs/ROLES_OWNERSHIP_R1.md trong repo backend.
Đã kiểm những case nêu trong kết quả bàn giao, không khẳng định bao phủ mọi case/race. R2 ma trận và audit viewer ở các phần sau; không tự đổi quyền legacy hay membership project cũ.
