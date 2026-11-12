# Plan nối cấu hình issue type, status và workflow

Nền FE8056137, BEf5c97a2. Người dùng yêu cầu phần cấu hình tiếp theo. Plan đã được người dùng chốt: triển khai, tự test, commit/push; giữ nhóm status cố định sau khi tạo. Tiếp tục PostgreSQL local và cơ chế phiên/BFF hiện có.

## 1. Mở màn hình và phân biệt phạm vi

- Thêm /app/admin/issue-types, /app/admin/statuses, /app/admin/workflows bằng UI kit/thiết kế đã có trong ui-demo, không dùng dữ liệu mẫu. ConnectedShell có link cấu hình cho AccountContext.systemAdmin=true. Admin gate đọc phiên thật; người không có SYSTEM_ADMIN mở URL trực tiếp sẽ nhận forbidden, không dựng form quản trị.
- issue_types, issue_statuses và workflow_rules là danh mục/rule toàn hệ thống; chỉnh tại đây có hiệu lực cho mọi project. Backend GlobalSecurity.assertSystemAdmin vẫn kiểm mỗi mutation, không dựa vào menu hoặc project role. Không triển khai quản lý user/role/permission/audit dashboard trong đợt này.
- Cài đặt project có tab Thông tin/Loại công việc/Workflow. Tab Loại công việc hiển thị các project_issue_types của projectId từ route đã qua ProjectGate. Thêm/gỡ/mặc định cần quyền MANAGE_BOARD hoặc UPDATE_PROJECT, lead/admin dùng quyền BE hiện có. Tab Workflow của project chỉ xem bộ rule toàn hệ thống và chuyển hợp lệ; admin có link sang màn sửa toàn hệ thống, không mô phỏng workflow riêng theo project.
- API hiện chỉ lưu tên issue type, tên/nhóm status và cặp trạng thái workflow. UI chỉ cho sửa các trường này, không dựng mô tả/icon/màu hoặc usage count giả nếu chưa có trong response.

## 2. Danh mục issue type

- CatalogScreen và useConfigurationQueries đọc GET issue-types. issueTypeId là issue_types.issue_type_id, khác projectId và khóa ghép project_issue_types. Read có actor key, AbortSignal, kiểm cookie actor dưới khóa phiên; lỗi không thay bằng empty state.
- Form tạo/sửa gửi POST issue-types hoặc PUT issue-types/{issueTypeId} chỉ gồm typeName sau trim, 1..50 ký tự. BFF kiểm method/path/query/body/Origin, BE kiểm admin và validation trước persist; tên trùng theo ràng buộc DB trả409, thiếu ID404, sai dữ liệu400.
- DELETE issue-types/{id} có xác nhận theo tên/ID đang chọn. BE kiểm loại còn được gán trong project_issue_types hoặc được issues sử dụng thì409; không xóa dây chuyền cấu hình project hoặc issue. Không còn liên kết mới xóa issue_types. Bản ghi đã mất trả404. DB unique/FK vẫn là lớp chặn cuối khi thao tác chạy đồng thời.

## 3. Gán/gỡ và loại mặc định của project

- GET projects/{projectId}/issue-types lấy cặp projectId/issueTypeId và isDefault thật. Catalog toàn cục chỉ dùng để chọn loại chưa gán, không lấy ID theo vị trí/tên hiển thị. POST projects/{projectId}/issue-types/{issueTypeId} chỉ gán, PUT .../{issueTypeId}/default đặt mặc định, DELETE .../{issueTypeId} gỡ.
- ProjectIssueTypeServiceImpl thêm helper lockProject: kiểm quyền ban đầu, lấy khóa projects của đúng projectId, refresh project và membership của actor, rồi kiểm quyền lần hai. Thiếu quyền sau khi chờ khóa dừng403 trước ghi. Cả assign/default/remove dùng khóa chung với createIssue và member mutation.
- Assign đọc tồn tại project/issue type và cặp khóa; cặp đã có409. Khi isDefault=true qua API cũ, bỏ cờ các loại khác và gán loại mới trong cùng transaction. UI mới tách thao tác gán và đặt mặc định; không ghép hai request thành thao tác nguyên tử giả.
- Set default phải tìm thấy loại đã gán trước cập nhật. Trong một transaction, chuyển cờ loại mặc định cũ sang false và loại được chọn sang true; flush theo thứ tự tránh va unique khi chuyển cờ. Hai lượt đổi mặc định được tuần tự hóa theo project; kết quả sau cùng chỉ có một cờ true.
- Remove kiểm loại có issue trong chính project thì409, hoặc đang mặc định thì409 và hướng dẫn đặt loại khác. Không tự thay loại trên issue, không tự chọn default mới. Cho phép project chưa có default như API hiện tại; form tạo issue vẫn dùng fallback đã có khi chưa chọn mặc định.
- Migration009 bổ sung unique partial index project_issue_types(project_id) WHERE is_default=true và unique cặp from_status_id/to_status_id cho workflow_rules. Kiểm dữ liệu trùng trước tạo index; nếu có thì dừng và báo, không tự xóa/chọn dòng để sửa dữ liệu. Giữ checksum000..008, backup trước áp dụng DB demo, chạy lại phải an toàn.

## 4. Status và workflow toàn hệ thống

- StatusScreen đọc GET issue-statuses, statusId là issue_statuses.status_id; nhóm là TO_DO/IN_PROGRESS/DONE. Tạo gửi statusName 1..50 sau trim và statusCategory hợp lệ. Sửa tên giữ ID/nhóm hiện tại để issue, mapping và rule tiếp tục tham chiếu đúng bản ghi.
- Quy tắc đã chốt: nhóm được chọn khi tạo và giữ cố định sau đó. PUT yêu cầu statusCategory khớp bản đã lưu, khác trả409; UI sửa chỉ đổi tên và hiện nhóm read-only. Quy tắc này bảo toàn ý nghĩa trạng thái và lịch sử Scrum, không cần dựng lại burndown/snapshot khi sửa metadata. Tạo trạng thái mới khi cần nhóm khác.
- DELETE status có xác nhận. BE kiểm issues, board_column_statuses, workflow_rules và lịch sử issue_transitions còn tham chiếu thì409; không tự gỡ mapping/rule hoặc xóa lịch sử như bản demo. Thiếu status404. Người dùng gỡ rule/mapping ở màn tương ứng trước nếu chúng là liên kết cản xóa; status còn lịch sử sẽ được giữ.
- WorkflowScreen đọc GET workflows/rules và danh sách status để chọn. fromStatusId/toStatusId là hai ID issue_statuses, ruleId là workflow_rules.rule_id. POST chỉ nhận cặp ID dương khác nhau; không tự chuyển400, trạng thái không tồn tại404, cạnh trùng409. Unique index xử lý hai request tạo cùng cạnh đồng thời.
- DELETE workflows/rules/{ruleId} chỉ xóa cạnh đã xác nhận, không sửa status/issue/transition lịch sử. Tạo/xóa rule không tự đổi trạng thái issue. Chuyển trạng thái tiếp tục dùng GET allowed-transitions và service hiện có, nên rule vừa xóa phải biến mất sau refetch.
- Hoàn thiện validation DTO/service/controller cho ba nhóm, trả400 rõ ràng khi tên trống/quá dài/category hoặc ID không hợp lệ. Nếu cần bổ sung handler validation/body parse tại GlobalExceptionHandler, giữ JSON lỗi an toàn và không thay trạng thái401/403/409 của luồng đã nối.

## 5. Mutation, cache và lỗi

- useConfigurationWrite/useProjectTypeWrite dùng connectedMutation, Web Locks, capture scope và completeConnectedMutation. Actor lấy từ session, không từ form. Sau khi đợi khóa/auth, kiểm lại admin hoặc quyền project và trạng thái gate trước dispatch. Khóa bấm đôi giữ đến hoàn tất; không replay POST/PUT/DELETE.
- Sau commit đánh stale cache theo actor kể cả form đã unmount. Chỉ refetch/completion nếu cookie actor vẫn khớp. Probe/refetch lỗi sau commit báo đã lưu/chưa xác nhận, giữ draft và khóa gửi tiếp đến reload. 409 giữ form, đọc bản mới để người dùng quyết định, không tự ghi lại bằng dữ liệu mới.
- Sửa tên/type/default làm mới catalog, project types, issue-refs, issue/list/planning/board-catalog/board của actor đúng phạm vi; đổi status/rule toàn cục làm mới reference, allowed transitions, board và báo cáo đang được xem. Project-specific mutation chỉ invalidates project liên quan, global mutation invalidates các project trong cache actor.
- Session đã đổi thì bỏ form/cache cũ. Tab khác dùng focus/reload để lấy cấu hình mới như cơ chế hiện tại; không thêm WebSocket hoặc phát sự kiện chứa credential. Lỗi gate có retry tại form để giữ draft; quyền403/404 dừng đúng phạm vi.

## 6. Kiểm chứng, review và bàn giao

- FE unit kiểm allowlist/body/query/ID/Origin/cookie, response200/201/204, không replay, actor guard và invalidation. Typecheck/build và hồi quy các unit hiện có.
- BE unit/API kiểm admin/project/outsider, validation, tên/cạnh trùng, gỡ loại đang dùng/mặc định, status có FK/lịch sử, nhóm bất biến. PostgreSQL thật kiểm hai đổi default đồng thời, hai thêm cùng cạnh, transaction rollback và migration009 lặp; không diễn giải mock quyền thành bằng chứng phân quyền HTTP thật.
- Browser production với BE/PostgreSQL local trên project/catalog thử riêng: CRUD type/status/rule, gán/default/gỡ/F5, type mặc định trong form tạo issue, rename phản ánh issue/board, thêm/xóa rule tác động allowed transition thật, conflict403/409, double submit, gate/network error giữ draft, queued/late actor switch, completion uncertainty và mobile.
- Không sửa danh mục/status/rule của SHOP để làm fixture. Backup và preflight dữ liệu trước migration demo; chuẩn bị lại project/config demo sau test. Nếu phát hiện lỗi/đổi thiết kế đáng kể ngoài các bước trên thì trình phần chênh lệch trước sửa.
- Một reviewer độc lập chỉ đọc theo10 tiêu chí AGENTS; main xác minh/sửa finding trong scope, test và review lại. Secret/diff check, commit/push FE+BE nếu có thay đổi, đối chiếu SHA remote và bàn giao URL/tài khoản/luồng/giới hạn như các phần trước.
