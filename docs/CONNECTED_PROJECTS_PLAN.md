# Phần 2A — Nối quản lý dự án trên giao diện đã có

Người dùng đã chốt plan tích hợp từng phần và yêu cầu “làm tiếp”. Phần này thực hiện nhóm project trong plan đó; kết thúc bằng tự test/commit, gửi luồng kiểm và dừng. Không triển khai notification/report do máy kia nhận, không merge master BE.

## 1. Nguồn và giới hạn

- Nền FE feat/backlog-ui-review, BE feat/backend-integration; fetch trước sửa, hiện chưa có patch B0 từ máy kia. Owner máy này sửa hạ tầng chung cho project và ghi delta để patch B0 sau dựa đúng phiên bản.
- Dùng UI project list/table/card/modal/fields và kit đã có. Tách component nhận props để demo/API dùng chung, không import DemoProvider vào /app.
- Gồm list/tìm kiếm/table-card, tạo dự án rỗng, tổng quan/thông tin, sửa tên/mô tả và xóa khi BE cho phép. Issue/backlog/sprint/board thực hiện sau khi người dùng kiểm phần này.
- API tạo hiện không có transaction khởi tạo mẫu Scrum; bản thật không hiển thị lựa chọn giả đã tạo board/type. Lead lấy từ phiên tạo, key bất biến; không thêm luồng đổi lead hoặc tự cấp quyền PM.

## 2. Luồng đọc

1. Session thật → connectedRequest GET projects/getList → BFF → ProjectController → ProjectServiceImpl.getProjects. GlobalSecurity/ProjectSecurity lọc project theo người gọi trước khi trả nội dung; thiếu phiên401, không fallback fixture.
2. Bổ sung trường additive issueCount/memberCount/sprintCount/activeSprintName vào ProjectSummary, giữ tên field cũ. ProjectStatsRepository đọc theo tập project ID đã qua quyền: grouped count trên issues, project_members, sprints và query sprint ACTIVE. Bốn truy vấn theo tập ID, không gọi một loạt API mỗi dòng hoặc tải toàn bộ issue để đếm.
3. Không có dòng group sau truy vấn thành công nghĩa là count0; lỗi truy vấn phải trả lỗi, không ngụy tạo số0. memberCount đếm membership thật, lead được hiển thị riêng. Không sửa bảng/schema hoặc lịch sử báo cáo.
4. Mapper FE tạo ProjectListItem từ DTO; bảng/thẻ dùng component chung với demo, tìm/lọc/sort chỉ trên danh sách BE hiện đã lọc quyền. Chưa gọi đây là phân trang server.
5. Mở /app/projects/{projectId}/overview hoặc settings: projectId là projects.project_id từ URL. Kiểm số nguyên dương, gọi GET projects/{id} + account/context?projectId; thiếu404/không quyền403 dừng ở state riêng, không lấy project đầu tiên thay thế.
6. Project layout/shell dùng tên/mã và quyền response thật, query key có user/project; chuyển project hoặc tài khoản phải bỏ response/cache cũ. Chỉ render link đến route đã nối; không tạo link board/backlog/report404 trong phần này.

## 3. Luồng tạo

1. Nút theo CREATE_PROJECT toàn cục. Form nhận name/key/description; tên trim bắt buộc tối đa100, key trim bắt buộc tối đa10. Gợi ý key dùng cách hiện có, không áp regex mới hoặc đổi case dữ liệu legacy trong BE.
2. POST projects/create qua BFF: chỉ chuyển projectName/projectKey/description, không chuyển leadId/permission do browser tự gửi; Origin hợp lệ và JWT bắt buộc cho protected mutation. Body sai400; không auto retry sau timeout/5xx.
3. BE kiểm CREATE_PROJECT trước xử lý ghi; user lead lấy từ JWT, không từ form. Kiểm blank/length và trùng key; trùng409, giữ form. Ghi projects với created_at/issue_sequence hiện có trong transaction; xung đột unique đồng thời theo DB trả409.
4. Thành công nhận ID thật, invalidate list và mở overview đúng ID. Dự án chưa có issue/member/sprint hiển thị count0 từ DB. Không giả thành đã có board hay cấu hình.

## 4. Luồng sửa

1. Settings đọc project/context, form hiện tên/key/mô tả và lead thật. UPDATE_PROJECT của đúng project quyết định trường/nút sửa; viewer chỉ đọc. Key/lead giữ read-only theo API hiện tại.
2. Save có dirty/pending/error; PATCH projects/{id} body chỉ projectName/description. BE kiểm quyền, tồn tại, dữ liệu trước cập nhật. Blank400, thiếu403/404; lỗi giữ bản nháp, Cancel lấy lại bản đã lưu.
3. Transaction chỉ đổi projects.project_name/description, không chuyển lead/key hoặc sửa issue/sprint/member. Thành công response BE cập nhật detail/list/title; F5 phải giữ dữ liệu. Chưa thêm revision project hoặc bảo đảm chống lost-update cho hai người sửa tên cùng lúc.

## 5. Luồng xóa

1. Quyền DELETE_PROJECT toàn cục theo luồng BE hiện có, không tự biến quyền lead/PM thành quyền xóa. Dialog yêu cầu gõ đúng key và xác nhận, không xóa từ GET hoặc khi chỉ mở dialog.
2. DELETE projects/{id} qua BFF bảo vệ Origin/Bearer. BE kiểm quyền/tồn tại; repository.delete cùng audit trong transaction. Flush để lỗi FK được trả409 trước khi báo thành công.
3. Issue/member/sprint/board còn liên kết giữ nguyên và gây từ chối theo FK; không xóa dây chuyền chúng. Quan hệ project_issue_types giữ cascade cấu hình cũ của entity, không thêm cascade nghiệp vụ mới.
4. Audit lỗi hoặc FK lỗi rollback việc xóa. Thành công200 rỗng/204 phải qua BFF đúng, không json() gây502; clear cache project rồi về list. Timeout kiểm lại trạng thái trước khi thử lại, không tự replay delete.

## 6. Điểm thêm/sửa

- BE DTO project giữ field cũ, thêm counts; ProjectStatsRepository mới; ProjectServiceImpl transaction/validation/read stats, ProjectController dùng validation request, request DTO giới hạn dữ liệu.
- FE project presentation/fields dùng chung; features/connected/projects gồm DTO/mapper/query/mutation/list/detail/settings; pages project, shell/project links và screens.tsx chuyển list tới adapter thật.
- BFF server.ts: allowlist route/method project, validate body/query; mọi protected mutation có Bearer/Origin; giữ nguyên auth rotation/cookie. Xử lý 200 rỗng/204, thêm message lỗi project rõ. Không mở proxy notification/report ở đây hoặc thay đổi file họ đang làm.

## 7. Kiểm và bàn giao

- BE regression/mapping/validation/permission + HTTP/PostgreSQL thật: counts khớp, key trùng, missing/outsider, tạo/sửa/F5/xóa rỗng, xóa project có dữ liệu409 và dữ liệu vẫn còn. Test transaction/audit phù hợp nếu thêm nhánh.
- FE model/BFF unit, typecheck/build; browser thật trên DB demo: admin create → overview → settings/edit/cancel/save/F5 → table/card/search → delete; PM/dev quyền khác, gọi API trực tiếp không vượt quyền; error/empty/mobile.
- Review/live test đổi tài khoản trong lúc mutation đang chờ: khóa liên tab và kiểm actor trước dispatch; completion kiểm lại cookie actor sau invalidate, không chỉ dựa vào event/cache có thể chậm. Không replay business mutation sau401 và không điều hướng/toast phản hồi của tài khoản trước.
- Dữ liệu demo local thêm tài khoản admin giả lập bằng role hiện có nếu cần, credential ở file ngoài Git. Không sửa DB jira hiện có, không chia sẻ DB/mật khẩu giữa hai máy.
- Review độc lập phần transaction/security/proxy phức tạp theo AGENTS, sửa finding trong phạm vi rồi kiểm lại. Không dùng agent để viết code thay.
- Commit FE/BE riêng, push nhánh đã được người dùng cho phép; gửi URL/tài khoản local/luồng kiểm/giới hạn rồi dừng chờ người dùng trước issue/backlog.
