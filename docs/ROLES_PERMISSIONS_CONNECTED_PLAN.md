# Plan phần2 — Role và permission

Trạng thái: R1 và bổ sung P1 đã được người dùng chốt; đang triển khai và kiểm thử. R2 chưa triển khai.
Nền đã kiểm: FE8373214 (feat/backlog-ui-review), BEd28536f (feat/backend-integration), working tree sạch.
Máy này: người dùng → role/permission → audit. Máy kia: tổng quan → sửa/xóa sprint → thứ tự cột. Không ghép ba phần máy kia trong lượt này.

## 1. Các quyết định cần chốt

### P1 — Người dùng thường tự tạo và quản lý dự án (cập nhật theo yêu cầu mới)

P1 thay thế các đoạn bên dưới đang coi CREATE_PROJECT là đặc quyền SYSTEM_ADMIN. Người dùng đã xác thực, tài khoản còn hoạt động được tự tạo project, kể cả không có dòng user_role_assignments. Quyền tạo mới không cấp quyền xem hoặc quản lý project của người khác.

Quy tắc dự kiến: người tạo là lead/chủ project và có membership PROJECT_MANAGER ngay khi tạo. SCRUM_MASTER vẫn là role được chọn khi thêm thành viên, không tự gán cho người tạo. SYSTEM_ADMIN giữ quyền quản trị mọi project; role dự án không tạo quyền quản trị hệ thống.

Luồng xử lý và các đoạn code thay đổi:

1. AccountContextService.getAccountContext và GlobalSecurity.hasPermission:
   - Actor lấy từ JWT, là users.user_id; context đã kiểm users.enabled trước trả dữ liệu.
   - CREATE_PROJECT là khả năng chung của tài khoản đã xác thực/hoạt động, không tra role_permissions hoặc assignment global legacy.
   - Các quyền quản trị toàn cục còn lại vẫn chỉ SYSTEM_ADMIN. Không thêm global role mới, không ghi assignment cho người được tạo project.
   - FE ProjectsScreen tiếp tục dùng context.globalPermissions chứa CREATE_PROJECT để hiện nút Tạo dự án; context.systemAdmin vẫn false với user thường. Việc có CREATE_PROJECT không mở menu quản trị.

2. ProjectServiceImpl.createProject — xác thực và kiểm đầu vào:
   - Actor ID từ JWT, không nhận leadId/userId/roleId từ body. Khóa và refresh đúng users của actor để đọc enabled hiện tại; chưa đăng nhập401, bị khóa401, user không tồn tại thì dừng.
   - Dùng lại validateName/validateDescription và kiểm key hiện tại. Dữ liệu sai400; key trùng409, không lưu project hoặc membership.
   - Tra user_roles theo mã PROJECT_MANAGER do chương trình seed. Thiếu role mặc định thì409 và dừng; không tự tạo role/grant hoặc chọn role legacy khác ngẫu nhiên.

3. ProjectServiceImpl.createProject — ghi dữ liệu nguyên tử:
   - Tạo projects với lead_id=actor, project_name/project_key/description đã validate; flush lấy project_id.
   - Tạo project_members với khóa (project_id vừa tạo, actor users.user_id), role_id của PROJECT_MANAGER và assigned_at hiện tại.
   - Ghi audit CREATE_PROJECT entity PROJECT, entity_id là project_id trong cùng transaction.
   - Gọi lại attachCounts cho response sau khi membership đã ghi để count thật là1; người dùng không phải reload mới thấy mình trong thành viên.
   - Bất kỳ bước role/membership/FK/audit lỗi đều rollback cả project và membership. DB unique project_key chặn hai lượt tạo cùng key; không tự retry mutation.

4. ProjectSecurity và luồng quản lý project:
   - Dùng lại lead_id để chủ project có quyền quản lý chính project đó, kể cả khi role membership được đổi. Membership PROJECT_MANAGER là role hiển thị và quyền theo role cho các thành viên khác; ownership là quan hệ riêng, không tự chuyển theo đổi role.
   - User chỉ thấy project mình lead hoặc có membership; user khác biết projectId vẫn403. Một người có thể là PROJECT_MANAGER ở project A và DEVELOPER ở project B.
   - Giữ chặn gỡ lead tại removeMember; chưa thêm chuyển chủ dự án hoặc tự backfill membership cho lead của project cũ.

5. Thêm/mời thành viên — dùng lại ProjectMemberServiceImpl.addMember/updateRole:
   - Người gọi lấy từ JWT; projectId từ URL; userId là người được thêm; roleId là user_roles do form chọn.
   - Khóa đúng projects rồi kiểm ADD_MEMBER ở chính project đó. Không đủ403; target user thiếu404/bị khóa409; role thiếu404; SYSTEM_ADMIN không được gán làm role project; membership trùng409.
   - Lưu đúng project_members(project_id,user_id,role_id), sau đó audit và notification theo luồng hiện có. Đây là thêm trực tiếp tài khoản đã đăng ký, chưa có bước email mời/chờ chấp nhận.
   - Giữ quy tắc hiện tại tối đa một PROJECT_MANAGER mỗi project: người tạo đã giữ role này, thành viên mới chọn SCRUM_MASTER/DEVELOPER/custom. Không tự thay role của người tạo hoặc chuyển ownership khi thêm người khác.

6. Xóa project thuộc quyền sở hữu — phần mở rộng đã chốt:
   - ProjectServiceImpl.deleteProject khóa projects theo ID trước kiểm lead/quyền. Chỉ SYSTEM_ADMIN hoặc đúng lead_id được yêu cầu xóa; PM thành viên khác không mặc nhiên được xóa chỉ nhờ cùng tên role. User ngoài project403; project thiếu404.
   - Chỉ cho xóa project chưa có issue/board/sprint hoặc thành viên khác lead. Không cascade dữ liệu công việc. Nếu chỉ còn membership của chính lead, xóa đúng dòng đó rồi xóa projects và flush/audit trong cùng transaction.
   - FK vẫn là chốt cuối cho dữ liệu phụ thuộc hoặc lượt tạo dữ liệu xen kẽ; lỗi409 rollback membership vừa xóa và project. Không tuyên bố mọi writer đều giữ khóa project.
   - ProjectSecurity trả DELETE_PROJECT đúng lead/SYSTEM_ADMIN; role_permissions không thể cấp quyền xóa ownership cho thành viên khác. FE ProjectSettingsScreen dùng context.projectPermissions thay cho globalPermissions để hiện nút Xóa; sửa hướng dẫn điều kiện xóa để không bắt người dùng gỡ lead vốn bị chặn.

7. Test P1 trước ghép R1:
   - User thường không global role có CREATE_PROJECT nhưng systemAdmin=false; tạo thành công, lead đúng JWT, membership PROJECT_MANAGER/count1, không có assignment global mới.
   - Thấy project mới, sửa thông tin/thêm thành viên/gán role trong project; không đọc/sửa/xóa project của user khác hoặc truy cập admin users/roles.
   - Thành viên role khác chỉ có quyền trong project được gán; user không phải lead không được xóa theo grant DELETE_PROJECT legacy.
   - Anonymous/disabled/malformed body/key trùng/thiếu role mặc định/audit lỗi không để lại project hoặc membership mồ côi. Hai request cùng key chỉ một project và một membership.
   - Xóa project rỗng có sole lead membership thành công; có thành viên khác hoặc issue/board/sprint thì409, membership lead vẫn còn sau rollback. SYSTEM_ADMIN vẫn xử lý được theo cùng điều kiện dữ liệu.
   - Project cũ chỉ có lead vẫn truy cập được; không tự đổi dữ liệu legacy. Test FE nút tạo/xóa, role lúc thêm thành viên, actor đổi giữa request; hồi quy role admin, user admin, danh sách project và members.

P1 không mở rộng quyền quản trị toàn hệ thống cho PM/Scrum Master. Người dùng đã chốt R1/P1; kết quả thực hiện và kiểm thử xem ROLES_PERMISSIONS_CONNECTED.md. Phần R2 vẫn cần nghiệm thu R1 trước khi triển khai.

1. Giữ header/sidebar, thêm trang /app/admin/roles trong Cấu hình hệ thống; dùng bố cục bảng role và ma trận quyền của AdminRolesScreen mẫu, không dùng DemoProvider.
2. Role mới có mã tên 1..50 ký tự, chuẩn hóa trim + chữ hoa, dạng [A-Z][A-Z0-9_]*. Không tự đổi dữ liệu role legacy trên DB.
3. Bốn role được chương trình seed: SYSTEM_ADMIN,PROJECT_MANAGER,SCRUM_MASTER,DEVELOPER. Không tạo bản sao/đổi tên/xóa chúng để tránh seed tái tạo hoặc làm sai guard PM. Ba role project vẫn cho cấu hình quyền; SYSTEM_ADMIN luôn toàn quyền theo security hiện tại nên ma trận chỉ xem, không giả vờ có thể gỡ một checkbox để thu hồi admin.
4. Permission là mã cố định PermissionName trong code. Màn hình hiển thị danh mục mã và nhãn giải thích, không cho nhập mã tùy ý, đổi tên hoặc xóa mã quyền đang được chương trình sử dụng. Phần quản trị là chọn các quyền cho role; thêm hành vi quyền mới cần thay code/backend, không chỉ thêm bản ghi.
5. Chỉ SYSTEM_ADMIN được gán toàn hệ thống; mọi role khác chỉ gán trong project_members và áp dụng đúng project. Không thêm scope/description giả vào DB; backend trả scope metadata theo quy tắc này. Lead giữ quyền trong project phụ trách. Assignment global legacy của role khác không còn cấp quyền toàn cục; không tự xóa DB.
6. Ma trận lưu nguyên tử cho MỘT role mỗi lần. Có Lưu/Hủy và chống ghi đè khi tập quyền đã đổi; không loop nhiều POST/DELETE rồi báo đã Lưu tất cả.
7. Sửa seed: chỉ cấp bộ quyền mặc định khi chính role đó vừa được tạo lần đầu. Role đã tồn tại giữ nguyên cấu hình kể cả tập quyền rỗng; restart không tự cấp lại quyền admin vừa gỡ.
8. Ghi audit thay đổi role/quyền đúng entity ROLE, không gán nhầm roleId thành userId. Cần thêm EntityType.ROLE và migration mới mở rộng constraint audit. Audit viewer vẫn để phần sau.

## 2. Chia hai đợt nhỏ, làm tuần tự

### R1 — Danh sách/CRUD role + đọc danh mục permission

Làm trước. Siết phạm vi SYS toàn hệ thống theo mục8.1; bổ sung API đọc role/count, role CRUD, bảo vệ role cố định, validation/transaction/audit và link Vai trò & quyền. Danh mục permission chỉ đọc.

Sau R1: tự test/build/review, commit/push riêng, gửi URL/luồng để người dùng kiểm. DỪNG chờ xác nhận trước R2.

### R2 — Ma trận quyền

Sau R1 được kiểm: API đọc/lưu toàn bộ tập quyền của từng role, snapshot chống ghi đè, hoàn thiện bảng ma trận Lưu/Hủy, quyền thực tế ở project/global và seed giữ cấu hình qua restart.

Sau R2: tự test/build/review, commit/push riêng, gửi luồng kiểm. Không tự làm Audit viewer.

Plan dưới mô tả cả hai để người dùng hiểu quyết định chung; khi bắt đầu R2 phải đối chiếu nền Git mới và bổ sung/chốt lại nếu khác đáng kể.

## 3. Hiện trạng đã xác minh

- BE UserRoleController/UserRoleServiceImpl có GET/POST/PUT/DELETE /api/user-role; GET trả {role,roleName}. POST201,PUT200,DELETE204.
- Create/update/delete đã assertSystemAdmin nhưng chưa đủ validate/chuẩn hóa, update chưa check tên trùng trước save, missing delete chưa rõ404. Chỉ SYSTEM_ADMIN đang được bảo vệ tên/xóa.
- PermissionController có GET/POST/PUT/DELETE /api/permissions. PermissionName enum có13 mã, được AccountContextService/security/service kiểm bằng tên. CRUD mã tùy ý không tạo được capability mới.
- RolePermissionController chỉ có POST/DELETE /api/roles/{roleId}/permissions?permissionId=...; chưa có GET hoặc thay tập quyền nguyên tử. Cặp khóa role_permissions là role_id,permission_id.
- ProjectSecurity đọc role của đúng project_members(projectId,userId), còn GlobalSecurity đọc user_role_assignments. SYSTEM_ADMIN và project lead bypass permission rows; mọi membership được VIEW_PROJECT mặc định.
- PROJECT_MANAGER được guard member nhận theo tên, vì vậy đổi tên role có thể làm sai nghiệp vụ. DatabaseSeeder seed lại4 tên role và thêm lại các default grant mỗi startup.
- UserRole/Permission entity không có scope,description hoặc version ma trận. Không dùng thông tin mẫu để lấp trường không có.
- Permission DB hiện không có unique permission_name. Không tự sửa/xóa bản ghi legacy hoặc tự nhận không thể có mã trùng; preflight/catalog validation phải phát hiện trước tính ma trận.

## 4. R1 — Mở trang, đọc role và danh mục quyền

### 4.1 FE vào trang

1. /app/admin/roles qua ConfigurationAdmin/useConfigurationGate; actorId từ users.user_id trong session.
2. Không SYSTEM_ADMIN: dừng forbidden trước dựng form. Backend vẫn assertSystemAdmin trước đọc/ghi API quản trị.
3. GET read có cache actor/AbortSignal/probe cookie dưới khóa phiên như phần users.401/403/404/503 có state rõ; không giả empty list khi lỗi.
4. Bảng giữ tên role, nhãn cố định, phạm vi hợp lệ: SYSTEM_ADMIN là Hệ thống, role khác là Dự án. Số global assignment legacy và membership hiển thị riêng; không coi gán sai phạm vi là quyền hợp lệ.
5. Permission catalog ở cùng trang là read-only, chỉ hiển thị mã DB được backend nhận diện và nhãn giải thích. Không có nút CRUD mã quyền chung trong UI.

### 4.2 API đọc mới

GET /api/admin/roles → list:
- role: ID user_roles.role_id, roleName.
- scope: GLOBAL chỉ SYSTEM_ADMIN, PROJECT cho các role khác; metadata từ quy tắc backend, không phải field giả trong DB.
- reservedName: boolean cho4 role seed, editablePermissions=false riêng SYSTEM_ADMIN.
- globalAssignmentCount: số user_role_assignments dùng role.
- projectAssignmentCount: số project_members dùng role.

AdminRoleQueryService.list:
- assertSystemAdmin → đọc user_roles → grouped queries count hai bảng theo role IDs → map DTO trong read transaction.
- Không N query cho từng role, không gọi N API đếm. Không ghi DB.
- GET /api/user-role cũ giữ shape/khả năng đọc đang dùng ở admin-users/members, không bắt các caller đó nhận DTO mới.

GET /api/permissions giữ danh mục DTO {permissionId,permissionName}; API quản trị mới có thể bổ sung recognized/editable flags trong response riêng, không phá DTO cũ.
- supported là mã có trong PermissionName; bản ghi lạ hiển thị rõ chưa có hành vi tương ứng, không giả là quyền mới.
- Nếu nhiều DB IDs cùng canonical permissionName, dừng cấu hình và báo dữ liệu cần xử lý; không tự chọn một ID hoặc tự merge.

## 5. R1 — Tạo/sửa role

FE RoleDialog chỉ tên role, max50; không có scope/description giả. ID từ hàng role DB đã đọc, actor từ JWT.

### Tạo

POST /api/user-role, body đúng {roleName};201 DTO cũ {role,roleName}.
- BFF whitelist đúng fields,ID,Origin,cookie/body size, không nhận userId/permissionIds.
- UserRoleServiceImpl.createRole: assert admin → chuẩn hóa trim/uppercase → validate pattern/length → chặn4 tên seed → kiểm tên trùng canonical.
- Lỗi400/409 trước ghi. Tên tồn tại khác hoa/thường/space legacy cũng báo409, không tạo alias.
- Transaction giữ khóa quản trị chung theo thứ tự mục8; saveAndFlush user_roles. DB unique exact name chặn hai create chuẩn hóa trùng tên đồng thời; không tự retry.
- Audit CREATE_ROLE(entityType=ROLE,entityId=roleId mới) cùng transaction. Tạo role không gán role cho actor hoặc user/project nào.

### Sửa

PUT /api/user-role/{roleId}, body {roleName};200.
- roleId là user_roles, không phải userId/membership.
- Kiểm admin/khóa → đọc role và refresh → thiếu404 → tên hiện tại hoặc tên đích thuộc4 seed thì409.
- Validate/check duplicate trừ chính role. Cập nhật user_roles.role_name, giữ role_id/role_permissions/assignments.
- Custom role đang dùng được đổi tên: quan hệ dùng ID nên không đổi membership/quyền; các tên đặc biệt seed được bảo vệ.
- Ghi UPDATE_ROLE cùng transaction; lỗi rollback tên và audit.
- FE giữ draft khi409/503, không tự uppercase dữ liệu legacy trên DB khi chỉ mở dialog.

## 6. R1 — Xóa role

DELETE /api/user-role/{roleId} →204, xác nhận theo tên role đang chọn.
- assert admin/khóa → tìm/refresh role, thiếu404.
- Role seed409; role còn user_role_assignments hoặc project_members409. Không tự gỡ role khỏi người dùng/project.
- Với role custom chưa gán: xóa các dòng role_permissions của CHÍNH role đó rồi xóa user_roles trong cùng transaction. Giữ permissions gốc. Nội dung xác nhận nói rõ cấu hình quyền của role sẽ bị xóa.
- Dùng bulk delete khi phù hợp để collection đã load không persist lại child; kiểm FK cuối transaction. Nếu có lượt gán role/membership xen kẽ, FK/khóa phải làm một lượt thất bại và rollback, không mất dữ liệu người dùng.
- Audit DELETE_ROLE typeROLE/ID role giữ lịch sử dù role đã mất; audit không có FK role cần giữ entity.
- Không xóa đơn lẻ permission đang dùng, không cascade user_role_assignments/project_members.

## 7. Danh mục permission và API legacy

UI không mở POST/PUT/DELETE permissions qua BFF. Mã quyền là hợp đồng chương trình, không phải nhãn tùy ý.

Backend tăng bảo vệ các endpoint legacy liên quan:
- Chuẩn hóa/validate request, admin check trước mọi mutation.
- Tạo mã không thuộc PermissionName trả400 “Chưa hỗ trợ mã quyền này”; tạo canonical đã có409. Nếu canonical thiếu do DB chưa seed, việc tạo bản ghi hợp lệ không tự thêm hành vi ngoài enum.
- Không đổi/xóa mã đã thuộc PermissionName:409 để API trực tiếp không vô tình phá capability/seed. Bản ghi lạ chưa dùng có thể xử lý theo API legacy với validate/FK phù hợp, nhưng không có UI và không tự migration dọn chúng.
- Khi gán quyền vào role, chỉ nhận permissionId có mã hợp lệ đang được hệ thống dùng; không nhận free-text code hoặc alias.
- Nhãn/mô tả tiếng Việt của13 mã là thông tin hiển thị theo mapping code rõ ràng; field identity luôn ID/code thật.
- CREATE_ISSUE_TYPE hoặc các permission legacy không tự mở trang cấu hình SYSTEM_ADMIN: service toàn cục hiện kiểm admin riêng. Hiển thị rõ các quyền không thay thế SYSTEM_ADMIN, lead hoặc VIEW_PROJECT mặc định.

## 8. Khóa, transaction và audit dùng chung

Đề xuất một helper quản trị role dùng lại thứ tự AccountManagementService.adminTarget:
1. assertSystemAdmin để chặn caller không có quyền trước đọc/ghi.
2. Khóa các row SYSTEM_ADMIN hiện có theo roleId tăng dần (lockAdminRoles), cùng điểm khóa với gán/gỡ role user và khóa tài khoản.
3. Khóa/refresh actor users.user_id từ JWT, kiểm enabled và recheck admin sau khi chờ khóa.
4. Với mutation role/matrix cũ: khóa/refresh target user_roles.role_id; thiếu404. Không khóa target user của trang Người dùng ở đây.
5. Validate toàn bộ trước ghi, flush/audit trong cùng transaction. Giữ thứ tự này cho CRUD role, PUT matrix và POST/DELETE grant cũ để không hai writer bỏ qua nhau.

Các lượt gán role qua project_members không nhất thiết giữ cùng khóa admin/role. Phải đọc caller trước kết luận race delete–assign đã serialize; FK bảo vệ cuối, test thật chứng minh rollback. Không tuyên bố mọi API writer dùng chung một khóa nếu chưa sửa/chứng minh.

Audit:
- Thêm EntityType.ROLE và migration010_role_permission_audit.sql mở rộng audit_logs_entity_type_check giữ toàn bộ giá trị cũ +ROLE.
- Không sửa migration000..009, không dùng USER với roleId.
- CREATE_ROLE/UPDATE_ROLE/DELETE_ROLE/SET_ROLE_PERMISSIONS; no-op không tạo log thay đổi giả.
- Log chứa actor, roleId, tập quyền trước/sau khi áp dụng nếu cần trace; không chứa token/password.
- Backup trước migration demo, chạy lại an toàn; schema validate. Nếu constraint/canonical permission legacy khác dự kiến, dừng và báo dữ liệu cần kiểm, không tự sửa dữ liệu hàng loạt.

### 8.1 Siết phạm vi role — thực hiện trong R1

- GlobalSecurity.isSystemAdmin giữ kiểm SYSTEM_ADMIN trong user_role_assignments.
- GlobalSecurity.hasPermission cho các entry point toàn cục chỉ chấp nhận SYSTEM_ADMIN; không tổng hợp role_permissions của role dự án được gán global legacy để cấp CREATE_PROJECT/DELETE_PROJECT/DELETE_USER. Kiểm mọi caller để không chặn nhầm permission project.
- ProjectSecurity giữ kiểm project/user qua project_members và quyền lead trong đúng project; chỉ SYSTEM_ADMIN được vượt phạm vi.
- AccountManagementService.grantRole chỉ nhận SYSTEM_ADMIN ở phạm vi global; role khác trả lỗi trước ghi, kể cả direct API. Gỡ assignment global legacy vẫn cho admin thực hiện, không tự gỡ membership.
- FE admin-users chỉ cho cấp/gỡ quyền quản trị SYSTEM_ADMIN. Assignment global khác đã có hiện riêng là legacy/không cấp quyền toàn cục và cho gỡ rõ ràng. Trang Thành viên chỉ cho role dự án, không SYSTEM_ADMIN.
- Không tự xóa/chuyển assignment global legacy thành membership vì không biết project đích. Đọc inventory trước; dữ liệu thật ngoài fixture cần được báo rõ.
- Matrix PUT và POST grant legacy không cho permission toàn cục trên role dự án; backend phải kiểm, không chỉ disable checkbox.
- Test trực tiếp: global DEVELOPER/PM legacy không thấy project ngoài membership hoặc được tạo/xóa project bằng grant toàn cục sai phạm vi. PM/Developer vẫn thao tác trong project đúng quyền; lead đúng project và SYSTEM_ADMIN giữ quyền hiện có.
- Hồi quy phần Quản trị người dùng vừa bàn giao vì API/UI cấp role toàn cục được thu hẹp theo yêu cầu mới. Đây là plan, chưa sửa code.

## 9. R2 — Đọc ma trận quyền thật

GET /api/admin/role-permissions:
- Chỉ admin; trả role catalog/count/flags, permission catalog và snapshot permissionIds thực tế theo từng role.
- Query role/permission/grants theo batch, không N API mỗi ô/role.
- Dùng read transaction có snapshot nhất quán khi đọc nhiều bảng (PostgreSQL REPEATABLE_READ nếu cần); không trả ma trận tự suy từ tên role.

Bổ sung GET /api/roles/{roleId}/permissions:
- assert admin → tìm role404 → map danh sách permission DTO trong transaction, không phụ thuộc OpenEntityManagerInView.

FE matrix:
- Giữ bảng quyền × role theo mẫu; chỉ cho chỉnh một role được chọn tại một thời điểm. Cột khác chỉ xem.
- Đọc stored permissionIds tách effective permissions: SYSTEM_ADMIN luôn toàn quyền theo security, không giả DB đã có tất cả grant.
- SYSTEM_ADMIN disabled/read-only và giải thích quyền admin không thu hồi bằng checkbox.
- Ba seed role project sửa được tập permission; VIEW_PROJECT vẫn được đảm bảo theo membership hiện tại kể cả row VIEW_PROJECT bị bỏ. Lead vẫn đủ quyền.
- Custom role chỉ có phạm vi PROJECT. Matrix chỉ sửa các quyền backend xét trong project. CREATE_PROJECT,DELETE_PROJECT,DELETE_USER,CREATE_ISSUE_TYPE là thao tác toàn cục, không cho role dự án nhận. Grant legacy sai phạm vi hiện riêng là không áp dụng; loại bỏ khi Lưu cần xác nhận rõ, không tự sửa DB khi chỉ xem.
- Draft và expectedPermissionIds giữ từ snapshot lúc bắt đầu sửa. Background refetch không âm thầm thay base/draft; thay role khi dirty cần xử lý Lưu/Hủy rõ ràng.

## 10. R2 — Lưu tập quyền nguyên tử, chống ghi đè

PUT /api/roles/{roleId}/permissions body:

    {
      "expectedPermissionIds": [1, 4],
      "permissionIds": [1, 4, 8]
    }

200 trả snapshot mới của role.

RolePermissionService.replacePermissions(roleId,body):
1. BFF chỉ nhận hai arrays số nguyên dương, không trùng, có giới hạn theo danh mục; roleId path là user_roles. Không nhận actor/roleName.
2. BE assert admin và lock/recheck theo mục8. SYSTEM_ADMIN409 trước ghi.
3. Đọc role_permissions hiện tại từ DB sau khóa; so tập ID hiện tại với expectedPermissionIds. Không khớp409, không ghi gì, FE giữ draft và cho tải bản mới theo quyết định người dùng.
4. Kiểm toàn bộ permissionIds tồn tại và thuộc các mã được hỗ trợ; ID thiếu404, body sai400. Không sửa nửa tập rồi mới phát hiện ID sai.
5. Tính removed/added giữa tập cũ và desired; xóa đúng role_id/permission_id cần gỡ, thêm cặp mới, flush một transaction. Cặp giữ nguyên không thay đổi.
6. Desired==current sau so expected là no-op200; không audit thay đổi giả.
7. Audit SET_ROLE_PERMISSIONS cùng transaction. Lỗi insert/FK/audit rollback cả set; không client retry.
8. Hai PUT cùng expected, desired khác nhau chạy đồng thời: một lưu; lượt còn lại thấy tập mới và409. Đây là compare theo nội dung set, không version đầy đủ hoặc bảo đảm xử lý đúng một lần.
9. Tất cả POST/DELETE grant legacy phải giữ khóa/recheck tương tự, bảo vệ SYSTEM_ADMIN và invalidate snapshot tương thích; không để route cũ bypass writer/permission guards.
10. Snapshot không bảo vệ khỏi việc actor cố ý tải lại và ghi bộ mới; thao tác mới phải là xác nhận rõ trên base mới. Không tự merge hoặc gửi lại sau409.

Frontend chỉ một request PUT cho một role. Không lưu tất cả role bằng nhiều request rồi báo nguyên tử.

## 11. R2 — Giữ cấu hình qua khởi động

DatabaseSeeder.run hiện thêm lại grant mặc định mỗi startup. Sửa seedRole/bootstrap để trả biết role vừa tạo hay đã có:
- Enum permission catalog vẫn được seed khi thiếu.
- Chỉ khi role vừa được tạo mới thì gán default permissions.
- Role đã tồn tại giữ tất cả cấu hình role_permissions hiện có, kể cả rỗng. Không coi tập rỗng là DB thiếu để tự cấp lại.
- Giữ seedDefaultAdmin/last-admin hiện có; không thay tài khoản hoặc password mặc định ngoài yêu cầu.
- Không tự backfill quyền mặc định cho role legacy đã tồn tại. Nếu cần sửa dữ liệu đó phải báo riêng, không suy thành đồng ý reset quyền.
- Test bootstrap DB mới còn đủ quyền mặc định và lần chạy sau không khôi phục quyền admin vừa gỡ; kiểm restart BE trên fixture DB riêng.

## 12. Phiên, quyền thực tế và cache cho R1/R2

Dùng các helper đã kiểm ở users/configuration, nhưng không dùng write.busy để làm canDispatch=false của chính request đang chờ auth.
- actor từ session, target role/permission từ response thật.
- canDispatch kiểm lại gate SYSTEM_ADMIN sau đợi Web Locks; PUT/POST/DELETE không replay.
- Late actor/change tab/unmount không đưa snapshot vào form hoặc cache người khác.
- Sau commit đánh stale role catalog, matrix, user role/detail/list, membership role catalog, account context/project context và các query quyền liên quan của actor.
- Refetch/completion chỉ bắt đầu sau probe cookie actor;403/409 cũng giữ điều kiện này. Query inactive lỗi cũ không khóa kết quả mới.
- Network/5xx/probe/refetch lỗi sau ghi: uncertainty latch actor gcTimeInfinity tới reload, giữ draft/khóa gửi lại; đóng mở form/rời trang không làm bật gửi lần hai.
- Gate503 retry trong modal cho đủ query gây blocked.
- Role/permission đổi không tăng auth_version và không thu hồi phiên user hàng loạt. API kiểm DB ở request sau; tab khác focus/reload cập nhật context/menu, chưa có realtimepush.
- Role dự án không được gán global để vượt phạm vi. Lead/admin và VIEW_PROJECT mặc định giữ semantics đã mô tả, không mở rộng quyền project khác.

## 13. File dự kiến

FE:
- app/app/(protected)/admin/roles/page.tsx.
- src/features/connected/roles/{contract.ts,queries.ts,screen.tsx,...}.
- src/features/connected/configuration/screens.tsx thêm link Vai trò & quyền.
- src/features/connected/server.ts thêm allowlist đúng endpoint của R1 rồi R2.
- Dùng kit và bố cục AdminRolesScreen; không sửa header/sidebar, không schema scope/description giả.
- Test/docs riêng, hồi quy admin-users/members vì dùng chung role catalog.

BE:
- AdminRoleController/QueryService và DTO role/count/matrix snapshots.
- UserRoleServiceImpl, RolePermissionServiceImpl +interface/controller, PermissionServiceImpl safeguards.
- Repository query/lock/bulk/projection cần cho role/count/set.
- DatabaseSeeder cho R2.
- EntityType.ROLE, migration010 cho R1 audit role.
- Helper admin mutation lock dùng chung nếu cần; không refactor toàn bộ account/project security ngoài scope.

## 14. Kiểm chứng và điểm dừng

### R1
- CRUD custom role/F5, trim/uppercase/length/pattern, tên trùng/race create,404.
- Không đổi tên/xóa/tạo alias4 role seed; SYS không mất bảo vệ last-admin.
- Role assigned global/project409; role custom chưa gán xóa được cùng grant cấu hình, không xóa permission/user/membership.
- Delete–grant/member race và lỗi FK rollback không mất dữ liệu.
- Admin HTTP thật được phép; PM/developer/outsider403; legacy endpoints không bypass mã cố định.
- AuditROLE đúng actor/ID, migration repeat/old records giữ nguyên.
- FE unit/contract/hook,BE unit/API,PG thật,productionbrowser/mobile và hồi quy admin-users/members/catalogs.
- Review độc lập nếu phức tạp theo AGENTS, một reviewer chỉ đọc,main sửa/test/review lại.
- Secret/diff checks, commit/push FE+BE, đối chiếuSHAremote, gửi URL/tài khoản local/luồng và DỪNG chờ người dùng.

### R2
- MatrixGET/PUT/F5, expected snapshot stale409, atomic rollback với ID sai/lỗi giữa ghi/audit.
- Hai save đồng thời, POST/DELETE legacy cạnh tranh cùng role; không partial set.
- Seed lần đầu đúng defaults, seed/restart không khôi phục grant đã gỡ.
- Custom role gán trong project: CREATE_ISSUE/MANAGE_BOARD có hiệu lực đúng API/context, không mượn quyền project khác. Gán role dự án global hoặc cấp CREATE_PROJECT cho role dự án bị chặn; assignment legacy không cấp quyền global.
- SYS/lead/VIEW_PROJECT bypass hiển thị đúng; không hứa checkbox thu hồi được các quyền này.
- Double-submit,uncertainty/remount/GC,503retry,actor queued/late,mobile.
- Hồi quy đủ phần trước,review,commit/push riêng, gửi luồng và DỪNG trước Audit.

Chỉ dùng PostgreSQL local/cluster test riêng và role/user/project fixture riêng. Không đổi permissions của PM/Developer dùng cho SHOP để làm test; nếu cần kiểm seed/default thì dùng DB riêng. Không commitsecret/dump/configlocal, không xóa/migrate dữ liệu người dùng khi chưa xác minh.
