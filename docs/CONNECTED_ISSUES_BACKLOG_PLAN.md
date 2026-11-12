# Nối issue và backlog trên nền connected

Phạm vi được người dùng chốt qua yêu cầu tiếp tục nối issue/backlog, tự test rồi bàn giao từng phần. Giữ nhánh hiện tại; không merge master, không sửa phần members/account mà máy kia phụ trách.

## Luồng thực hiện theo thứ tự

1. URL projectId là projects.project_id. ProjectGate/useConnectedProject đọc account/context của đúng project rồi projects/{id}; 401/403/404 hoặc lỗi mạng dừng ở trạng thái tương ứng, không dùng demo. Quyền CREATE_ISSUE, EDIT_ISSUE, DELETE_ISSUE, MANAGE_SPRINT lấy từ context; backend vẫn kiểm lại từng thao tác.
2. Danh sách issue gọi projects/{id}/issues/search. keyword/statusId/typeId/assigneeId/unassigned/priority/page/size/sort/direction đi qua whitelist BFF. ID trạng thái thuộc issue_statuses, type thuộc issue_types đã gắn project, người nhận thuộc project_members. BE đọc issues giới hạn project trước lọc/phân trang. Đổi filter về trang đầu; xóa dòng cuối thì điều chỉnh trang. Không tải tất cả issue để phân trang giả.
3. Reference đọc issue-statuses, projects/{id}/issue-types và members; chỉ đọc members, không thay phần quản lý thành viên. Category quyết định hoàn thành, không suy từ tên trạng thái. Detail đọc issues/{issueId}, kiểm projectId trả về khớp URL. ID issue là issues.issue_id, khác số trong issueKey.
4. Tạo: chọn loại đang gắn project, nhập summary/description/priority. connectedMutation khóa phiên liên tab, kiểm actor thật trước ghi. BFF chỉ nhận trường hợp đồng, kiểm dữ liệu và Origin. BE kiểm CREATE_ISSUE, khóa projects, đọc project_issue_types và trạng thái TO_DO; reporter lấy JWT, cấp issue_sequence và ghi issues trong transaction cũ. Lỗi giữ form; thành công invalidate danh sách/backlog/thống kê và kiểm actor lại trước đóng form/toast.
5. Sửa detail: PUT issues/{id} chỉ summary/description/priority/storyPoints; BE kiểm EDIT_ISSUE, khóa/refresh rồi cập nhật issues. Phân công dùng PUT assign với assigneeId project_members hoặc bỏ query để gỡ; đổi trạng thái dùng allowed-transitions theo statusId hiện tại, PUT status kiểm workflow/WIP và ghi lịch sử/notification/metrics theo luồng BE có sẵn. Mỗi hành động là một request riêng, không giả transaction cho nhiều request. Không sửa type/cha qua API chưa hỗ trợ. Metadata/assign/status hiện chưa có expectedVersion từ client; không tuyên bố chống lost update.
6. Xóa yêu cầu xác nhận và version đọc từ detail; DELETE issues/{id}?expectedVersion. BE kiểm DELETE_ISSUE, phiên bản/quan hệ; liên kết cản xóa hoặc phiên bản cũ trả409, giữ dữ liệu và cho người dùng tải lại. Không tự retry mutation hoặc tự cập nhật token phiên bản rồi xóa lại. Xóa thành công refresh toàn bộ cache liên quan.
7. Backlog: đọc projects/{id}/backlog, sprints/project/{id}, issues từng sprint FUTURE/ACTIVE. Dùng BacklogView hiện có nhận props. Product backlog do BE loại DONE và issue trong sprint mở; CLOSED không thuộc màn lập kế hoạch. Sắp xếp gửi toàn bộ issueIds của một nhóm, tắt khi đang lọc; BE kiểm tập ID và ghi backlog/sprint rank. 409 tải lại, không tự resend snapshot cũ. Chưa có revision toàn backlog, hai lượt reorder hợp lệ có thể lượt cuối thắng.
8. Chuyển product↔sprint gọi đúng một POST/DELETE sprints/{sprintId}/issues/{issueId}; cần MANAGE_SPRINT. Chuyển hai sprint yêu cầu đưa về backlog trước, tránh gỡ thành công nhưng thêm thất bại. Tạo sprint và start/complete dùng API cũ, kiểm MANAGE_SPRINT; FUTURE→ACTIVE→CLOSED do BE quyết định, issue chưa xong về backlog hoặc sprint đích, issue DONE giữ lịch sử. Không đổi nghiệp vụ BE, schema hay migration.
9. Cache gồm actor/project/filter. Mọi ghi dùng connectedMutation và guard vòng đời; sau invalidate dùng completeConnectedMutation để kiểm cookie actor trước thông báo/đóng form. Khóa submit chặn bấm đôi; lỗi không xóa draft. Không dùng localStorage token hoặc fallback fixture; timeout chỉ báo chưa xác nhận, không retry ghi.

## Điểm sửa và kiểm chứng

- issues/contract.ts phân loại endpoint và kiểm query/body; server.ts mở đúng các route này, giữ cookie/refresh/Origin hiện có.
- issues/model.ts, queries.ts, screens.tsx và panel.tsx: DTO, query, cache/mutation, list/detail/create; app routes và project navigation.
- backlog-view thêm quyền/callback thông báo dùng adapter thật, giữ mặc định preview; mapper truyền statusCategory thật.
- Unit BFF/model và hồi quy auth/project/planning; typecheck/build; browser trên PostgreSQL demo: tạo/sửa/gán/đổi trạng thái/xóa, tìm kiếm/phân trang, reorder/chuyển sprint/F5, lỗi, quyền outsider/developer và đổi phiên.
- Một sub-agent chỉ đọc review phần proxy/session/mutation phức tạp theo AGENTS; agent chính xác minh finding, sửa trong plan rồi kiểm lại. Không dùng sub-agent triển khai.
- Commit/push FE sau kiểm, bàn giao URL/tài khoản local/luồng kiểm và giới hạn; chờ người dùng trước phần board tiếp theo.
