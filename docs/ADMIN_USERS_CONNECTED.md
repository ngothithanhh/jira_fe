# Quản trị người dùng đã nối FE–BE

## Phạm vi và đường dẫn

Mở /app/admin/users bằng SYSTEM_ADMIN. Điều hướng Người dùng nằm trong Cấu hình hệ thống, giữ các màn issue type/status/workflow hiện có.

Gồm: danh sách có tìm kiếm, lọc enabled, phân trang; chi tiết; role toàn hệ thống; số membership project; gán/gỡ từng role; khóa/mở tài khoản. Không có tạo/xóa user, reset mật khẩu, sửa email/hồ sơ người khác hoặc CRUD role/permission trong phần này.

Giao diện dùng bố cục và UI kit của AdminUsersScreen mẫu, dữ liệu thật từ API. Role hệ thống là user_role_assignments; project role nằm ở project_members và trang Thành viên.

## Luồng sử dụng

1. Admin → Cấu hình hệ thống → Người dùng. Tìm theo tên/tên đăng nhập/email, chọn trạng thái và số dòng; chuyển trang.
2. Chi tiết → xem role hệ thống và số dự án tham gia (chỉ đếm membership).
3. Gán/Gỡ một role → xác nhận → đợi lưu và đọc lại. Mỗi thao tác là một request, không phải Lưu tất cả nguyên tử.
4. Khóa tài khoản → xác nhận. Target không đăng nhập được, token cũ bị thu hồi; công việc/lịch sử/membership còn nguyên.
5. Mở khóa → target đăng nhập lại bằng mật khẩu cũ. Token trước khi khóa vẫn không dùng lại được.
6. Admin tự gỡ quyền quản trị: còn đăng nhập nhưng không vào màn admin được. Admin tự khóa: các tab về đăng nhập. Backend luôn giữ ít nhất một admin enabled.
7. 409 giữ dialog;503/gate lỗi có retry trong modal. Kết quả có thể đã ghi nhưng chưa xác nhận: khóa gửi lại đến reload, kể cả đóng/mở modal hoặc rời trang lâu. Không tự replay mutation.

## API và dữ liệu

BFF /api/backend chỉ mở các route trong admin-users/contract.ts:

| API BE sau /api | Method | Ý nghĩa |
|---|---|---|
| admin/users | GET | keyword<=100, enabled tùy chọn, page>=0,size1..100 |
| admin/users/{userId} | GET | Chi tiết DTO và role/count thật |
| admin/users/{userId}/roles | GET | Các role toàn cục được gán |
| user-role | GET | Danh mục role dùng chọn ID có sẵn |
| admin/users/{userId}/roles/{roleId} | PUT/DELETE | Gán/gỡ một cặp,204 |
| admin/users/{userId}/enabled | PATCH | Body đúng enabled boolean,204 |

Role ID trong DTO hiện là trường role, không phải roleId. Danh sách mới trả items,page,size,totalItems,totalPages; từng user có userId,userName,fullName,email,enabled,createdAt,roles,projectMembershipCount. Không nhận hash/token từ DTO vào cache UI.

## Phiên và cache

- actor lấy từ session; target lấy từ hàng user. Query key và AbortSignal theo actor/filter/target.
- GET dưới khóa/probe actor. Mutation dùng adminUserMutation/withMutationActor, kiểm gate lại sau chờ khóa; bấm đôi chỉ gửi một lần.
- Disable được BFF probe /auth/me trước dispatch để xác định self từ access cookie. Self204 xóa hai cookie trước kết thúc phiên; không dùng /me bằng JWT đã thu hồi để xác nhận thao tác.
- Network/5xx sau dispatch self-disable đóng phiên local theo hướng chưa xác nhận; logout pending dọn cookie khi kết nối lại. Target khác không đóng phiên admin.
- Role change đọc lại AccountContext trước refetch. Tự mất SYSTEM_ADMIN cập nhật session/gate và bỏ cache admin; quyền project không tự đổi.
- Đánh stale sau commit; refetch và completion cần actor cookie đúng. Không gán response B vào cache/form A.
- Uncertainty latch ở QueryClient theo actor có gcTime Infinity, giữ tới reload/provider reset; lỗi query inactive cũ không khóa lượt lưu đã refetch thành công.

## Kiểm thử

npm run test:connected bao gồm connected-admin-users.test.mjs: hợp đồng/BFF/session transport và hook harness QueryClient thật. Harness giả React hooks/fetch/khóa nên không thay bằng chứng browser.

npm run test:admin-users:browser cần ADMIN_USERS_CREDENTIALS trỏ JSON local: origin,api,prefix,actor,guard,target,selfRevoke,selfDisable,lostSelf,pm,outsider,adminRoleId,developerRoleId. Mỗi account có id/email/password/userName/fullName; tạo mới fixture trước mỗi lượt vì suite khóa hoặc gỡ quyền tài khoản tự thử.

Đặt PLAYWRIGHT_MODULE,CHROMIUM_PATH theo runtime máy; ADMIN_USERS_OUTPUT chọn evidence folder ngoài Git. Chỉ dùng DB test/project/user riêng, không khóa admin/PM demo đang dùng.

Đọc ADMIN_USERS_CONNECTED_PLAN.md cho luồng BE/transaction và phạm vi được chốt. Role/permission CRUD và Audit viewer làm ở các phần sau; Tổng quan/sprint edit-delete/column reorder do agent máy kia.
