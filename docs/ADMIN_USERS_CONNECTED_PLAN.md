# Plan phần1 — Quản trị người dùng

Trạng thái: người dùng đã chốt plan và yêu cầu triển khai phần Quản trị người dùng. Nền FE6e2aece/feat/backlog-ui-review, BEdd07607/feat/backend-integration; working tree sạch trước bước chuẩn bị plan.

Phân việc đã xác nhận: máy này người dùng → role/permission → audit; máy kia tổng quan → sửa/xóa sprint → thứ tự cột. Chỉ triển khai phần1 sau khi chốt, không làm cả ba phần cùng lúc.

## 1. Phạm vi và giao diện

- Thêm /app/admin/users, link Người dùng trong điều hướng admin hiện tại. Giữ header/sidebar, trang issue type/status/workflow và root redirect hiện có; máy kia giữ Tổng quan.
- Giữ bố cục AdminUsersScreen mẫu: tìm người dùng, lọc hoạt động/bị khóa, bảng avatar chữ cái đầu/tên/email/role hệ thống/số dự án/trạng thái, modal chi tiết, xác nhận khóa/mở. Dùng UI kit chung, không dùng DemoProvider.
- Bảng mới phân trang server; modal chỉ hiển thị các trường DB thật. Không upload avatar, tạo/xóa tài khoản, đổi mật khẩu người khác hoặc sửa email/hồ sơ người khác.
- Có gán/gỡ các role đã tồn tại. Tạo/sửa/xóa role và ma trận permission thuộc phần2. user_roles hiện không có trường scope; không giả định role có GLOBAL/PROJECT từ demo. “Role hệ thống” ở màn này là quan hệ user_role_assignments; không sửa project_members.
- Mỗi thao tác gán/gỡ một role ghi một request riêng có xác nhận, không trình bày nhiều request như một lần Lưu nguyên tử. Giữ bảng và modal, hiển thị nút Gán/Gỡ rõ theo từng role thay checkbox nhiều thay đổi/lưu hàng loạt giả transaction.

## 2. Mở trang và kiểm quyền

1. ConfigurationAdmin/useConfigurationGate đọc AccountContext của actor đã đăng nhập. actorId lấy từ session users.user_id, không từ query/form.
2. Chỉ systemAdmin=true được dựng màn người dùng. PM/developer/outsider mở trực tiếp trả forbidden; query chưa có data hiện loading; lỗi mạng có retry.
3. BFF server.ts dùng module admin-users/contract.ts chỉ mở những endpoint trong plan. Mọi mutation kiểm Origin, cookie, ID nguyên dương, trường body/query và kích thước; không mở admin wildcard.
4. BE AdminUserController gọi GlobalSecurity.assertSystemAdmin trước query danh sách/detail. Quyền BE là bắt buộc, không dựa vào menu ẩn.
5. GET /api/user cũ hiện chưa kiểm admin ở UserServiceImpl.getAllUsers; bổ sung assertSystemAdmin tại đây để request trực tiếp không đi vòng danh sách quản trị. /app members đang dùng candidates/search theo project, không dùng endpoint này. Kiểm caller/test legacy trước thay đổi; đây là thay đổi giới hạn quyền rõ trong plan.

## 3. Danh sách, tìm kiếm và chi tiết: chỉ đọc DB

Thêm GET /api/admin/users?keyword=...&enabled=true|false&page=0&size=20 và GET /api/admin/users/{userId}.

- keyword tối đa100 ký tự sau trim, tìm không phân biệt hoa/thường theo userName/fullName/email; ký tự LIKE được xử lý như nội dung tìm, không cho thành SQL.
- enabled tùy chọn boolean; không gửi nghĩa là mọi trạng thái. page>=0,size1..100, offset không vượt int; sai400. Sort cố định createdAt DESC rồi userId DESC để phân trang ổn định.
- userId trên detail là target users.user_id; thiếu404. Chỉ tìm target sau kiểm admin. actor và target có thể khác nhau.
- AdminUserQueryService.search/get dùng transaction readOnly. UserRepository bổ sung query/specification trả Page<User>; không lấy toàn bộ users rồi lọc ở FE.
- Với IDs thuộc trang hiện tại, lấy user_role_assignments join user_roles theo batch và count project_members group userId. Ghép bằng users.user_id; không gọi N API role hoặc N query membership cho từng hàng.
- Response page: items,page,size,totalItems,totalPages.
- Mỗi item: userId,userName,fullName,email,enabled,createdAt,roles:[{role,roleName}],projectMembershipCount. role là user_roles.role_id theo UserRoleResponse cũ. projectMembershipCount chỉ đếm membership project_members của target, không đoán từ issue hoặc tính project mà target chỉ là lead nhưng không có membership.
- Detail dùng cùng DTO; chỉ trả thông tin hiển thị, không passwordHash/authVersion/token. Không ghi users/roles/membership/log khi đọc danh sách.
- FE useAdminUsers/useAdminUser keys chứa actor,filter,page và target; AbortSignal và khóa/probe actor như configurationRead. Search debounce và đổi filter reset page; sửa trạng thái làm số trang rỗng thì về trang còn hợp lệ.

## 4. Đọc các role để quản trị target

1. Khi mở modal, targetId từ hàng user đã chọn; GET admin/users/{id} đọc lại bản hiện tại. GET user-role lấy catalog role đã có; cache theo actor.
2. roles hiện gán đọc từ detail hoặc GET admin/users/{id}/roles cũ nếu cần đối chiếu; không dùng role project như role toàn cục.
3. Map khóa role của response thành roleId nội bộ FE nhất quán. Không phân biệt vai trò theo tên gần giống/hiển thị tiếng Việt; SYSTEM_ADMIN chỉ nhận theo kiểm tra backend hiện có.
4. Background refetch không tự đổi target/form khi người dùng đang xác nhận. Mất quyền hoặc target404 dừng thao tác;503 giữ modal/draft, khóa ghi và retry đủ nguồn đang gây blocked.

## 5. Gán/gỡ role: dùng nghiệp vụ cũ, mỗi lần một cặp

- PUT /api/admin/users/{targetId}/roles/{roleId} →204 gán.
- DELETE cùng route →204 gỡ.
- Không body, không actorId/projectId/permissionIds. RoleId từ catalog user_roles; targetId từ users, không nhầm membership.
- BE AccountManagementService.grantRole/revokeRole được dùng lại: assert admin → khóa các role SYSTEM_ADMIN theo thứ tự ID → khóa/refresh actor/recheck enabled và admin → khóa/refresh target → tìm role → kiểm assignment.
- Gán cặp đã có hoặc gỡ cặp chưa có là no-op204. Gán ghi user_role_assignments(user_id,role_id,assigned_at); gỡ xóa đúng cặp. Không ghi project_members/role_permissions.
- Gỡ SYSTEM_ADMIN khỏi target enabled khi chỉ còn một enabled admin trả409 trước ghi. Không làm yếu guard legacy role khác hoa/thường hoặc cơ chế đếm distinct user.
- Ghi audit GRANT_ROLE/REVOKE_ROLE cùng transaction. Lỗi rollback assignment và audit; không retry mutation tự động.
- Sau204 làm stale target/page/context và các cache quyền liên quan của actor; refetch/completion dưới probe actor. Gỡ role của chính actor có thể khiến actor mất SYSTEM_ADMIN: đọc AccountContext mới, đóng admin view/hiện forbidden theo quyền thật, không báo lỗi mạng hoặc giữ form ghi.
- Role change hiện không tăng auth_version như enabled/password. Quyền BE được đọc lại từ DB theo request; không tự thêm việc đăng xuất tất cả phiên khi thay role. Cache ở các tab khác cập nhật khi focus/reload; không cam kết push realtime.

## 6. Khóa/mở tài khoản khác

PATCH /api/admin/users/{targetId}/enabled, body đúng {"enabled":false|true}, response204.

- BFF chỉ nhận boolean enabled, không mass assign field. BE AccountManagementService.enabled đã có validate null400.
- Dùng lại thứ tự khóa adminTarget như mục5. Target thiếu404; actor không còn admin403.
- Không khóa enabled admin cuối:409, giữ target hiện trạng, không revoke token/audit. Trạng thái đã bằng request: no-op204.
- Đổi thật: users.enabled trước→sau; tăng users.auth_version một lần, revoke refresh_tokens của target, audit ENABLE_USER/DISABLE_USER trong cùng transaction. Mở lại cũng tăng version nên token cũ không sống lại.
- Không xóa issue, project, comment, attachment, membership hoặc role đã có.
- FE xác nhận theo tên/email target và thông báo phiên target bị thu hồi. Khóa/mở target khác giữ phiên admin, chỉ sau khi xác nhận đúng actor mới báo thành công/refetch.

## 7. Admin thao tác lên chính mình và trường hợp mất phản hồi

Không thêm hạn chế giả ở UI rằng admin không bao giờ được tự khóa/gỡ role. Backend vẫn bảo vệ admin enabled cuối cùng.

### Tự khóa

- Khi targetId==actorId và enabled=false, JWT actor bị vô hiệu ngay sau BE204; không gọi completeConnectedMutation bằng JWT đã thu hồi để quyết định rằng thao tác thất bại.
- BFF xác định actor bằng GET auth/me với chính access cookie/token trước dispatch cho nhánh disable; không tin isSelf/userId do client thêm. Nếu probe fail thì chưa gửi PATCH.
- Khi BE204 của tự khóa, xóa access/refresh cookie theo path đã cấp và trả cờ session-ended. Mutation client chạy một lần dưới withMutationActor (thêm helper riêng phù hợp), phát ended/xóa cache và đưa các tab về sign-in.
- Nếu timeout/mất response sau dispatch tự khóa, đánh dấu chưa xác nhận và đóng phiên local an toàn theo cơ chế password hiện có; không gửi PATCH lần hai. Nếu browser chưa nhận clear-cookie, dùng logout-pending để dọn phiên khi kết nối lại.
- Nếu400/403/404/409 xác định trước ghi, giữ phiên/draft theo lỗi thật; đặc biệt409 cuối-admin không được bị coi là đã tự khóa.
- Với target khác, không xóa cookie admin chỉ vì target bị khóa.
- Mọi sửa client.ts/server.ts chỉ là helper/nhánh riêng cần thiết; không đổi hợp đồng password hoặc logout đang chạy ổn.

### Gỡ role của chính mình

JWT vẫn còn hợp lệ; probe actor vẫn dùng được. Sau204 đọc context thật. Không còn systemAdmin thì bỏ cache admin và khóa/đóng trang đúng quyền mới; giữ đăng nhập cho phần tài khoản/project mà user còn quyền. Nếu vẫn còn role SYSTEM_ADMIN khác theo dữ liệu legacy thì giữ quyền đúng DB.

### Mọi mutation

- Khóa bấm đôi tới hết completion; canDispatch kiểm actor, gate, target và quyền sau chờ session lock.
- Đánh stale trước; chỉ bắt đầu refetch bằng cookie actor đã xác nhận. Cookie đã đổi không đưa dữ liệu B vào cache A; form đã unmount không được mở lại.
- Network/5xx/completion-probe/refetch lỗi sau khi có thể commit: giữ draft, hiển thị kết quả chưa xác nhận và khóa gửi lại đến reload; không tự gửi PUT/DELETE/PATCH mới.
-409 giữ modal và đọc trạng thái mới chỉ dưới actor đã xác nhận, không tự sửa draft rồi retry.
- Gate503 có retry trong modal cho tất cả query gây blocked. Query inactive error không chặn lượt ghi hiện tại.

## 8. Phạm vi file dự kiến

FE:
- app/app/(protected)/admin/users/page.tsx.
- src/features/connected/admin-users/{contract.ts,queries.ts,screen.tsx} và components nếu cần.
- src/features/connected/server.ts: allowlist/body/error/self-disable cookie.
- src/features/connected/client.ts: helper tự khóa dùng lại withMutationActor; không đổi các caller password hiện tại.
- src/features/connected/configuration/screens.tsx: thêm link Người dùng vào admin nav; không sửa shell/header/sidebar hoặc link Tổng quan máy kia.
- UI trình bày dùng kit và bố cục admin-screens.tsx mẫu; không import DemoProvider vào /app.

BE:
- controller/AdminUserController.java, service/impl/AdminUserQueryService.java, dto/admin user search/page/detail.
- UserRepository và batch query assignments/project members.
- UserServiceImpl.getAllUsers: assertSystemAdmin cho API legacy list.
- AccountManagementService mutating flows chỉ sửa nếu test/review phát hiện bug trong phạm vi đã chốt; thay đổi lớn phải bổ sung plan, không làm lại role/permission service.
- Không migration dự kiến.

Tài liệu/test thêm theo domain, không ghép chức năng role/permission CRUD hoặc audit viewer.

## 9. Kiểm chứng và dữ liệu

- FE unit/contract/hook: route/query/body/Origin/cookie/ID, paginated DTO,actor guard,invalidation, last-admin409, self-disable cookie/session-ended, lost response không replay, self-role mất quyền, lỗi inactive query.
- BE unit/API: SYSTEM_ADMIN/admin list/detail,403 user thường,legacy /api/user không bypass,400filter,404target/role,roles global khác membership, audit/transaction và bảo vệ admin cuối.
- PostgreSQL thật trên cluster riêng: số lượng/phân trang/filter/roles/count không nhân bản, self/other enabled auth_version/revoke, race hai admin cùng bị gỡ/khóa, rollback/audit và legacy duplicated admin role.
- Browser production + PG local: search/filter/page/F5/modal; khóa/mở người khác rồi thử login/token cũ; gán/gỡ từng role; cuối-admin409; tự gỡ admin còn đăng nhập nhưng mất màn admin; tự khóa hai tab ended; double submit, queued/late actor,503/retry/lost response; desktop/mobile.
- Fixture user/admin/project riêng cho test. Không khóa demo admin/PM đang dùng hoặc thao tác role trên dữ liệu SHOP. Không reset DB ứng dụng/create-drop; không in secret, không commit credential.
- Chạy build/typecheck/unit liên quan và hồi quy các helper/caller bị ảnh hưởng: auth/password/account, config, projects/members, issues/backlog/board, notifications/reports.
- Một reviewer độc lập chỉ đọc theo10 tiêu chí AGENTS vì phần này có quyền/phiên/transaction phức tạp; main xác minh/sửa finding thật,test và review lại.
- Sau pass: secret/diff check, commit/push FE+BE đúng nhánh đang dùng nếu remote không lệch; báo SHA/URL/tài khoản local/luồng kiểm.
- Dừng để người dùng kiểm tra phần1. Chỉ lập/triển khai phần2 role/permission sau xác nhận tiếp tục; không làm Audit hoặc Tổng quan trong lượt này.
