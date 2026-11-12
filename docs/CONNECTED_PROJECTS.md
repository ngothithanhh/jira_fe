# Phần 2A — Quản lý dự án nối backend

Phạm vi: danh sách bảng/thẻ/tìm kiếm, tạo dự án rỗng, mở tổng quan, xem/sửa thông tin và xóa khi không còn liên kết. Dùng lại phần trình bày từ UI đã duyệt trong project-views.tsx; demo và API có adapter riêng. Chưa nối issue/backlog/sprint/board hoặc Notification/Reports ở đợt này.

## Luồng dữ liệu

1. `/app/projects` → session thật → BFF GET projects/getList → Spring Boot lọc quyền → grouped counts của project được xem → bảng/thẻ.
2. Tạo → form tên/key/mô tả → protected POST projects/create → BE lấy lead từ JWT → transaction ghi projects → trả ID thật → tổng quan.
3. `/app/projects/{id}/overview` → account/context?projectId → GET projects/{id}. ID là projects.project_id; thiếu/quyền sai hiện 404/403, không đổi sang project khác.
4. Settings → kiểm UPDATE_PROJECT theo context → PATCH tên/mô tả → BE kiểm lại quyền/input → save → invalidate detail/list. Key/lead read-only, không nhận thay đổi từ browser.
5. Delete → quyền DELETE_PROJECT toàn cục → nhập đúng key → DELETE → flush + audit cùng transaction. FK409 giữ project và dữ liệu, success mới về list; không xóa dây chuyền issue/member/sprint/board.

### Hợp đồng

| API BE | Request / response |
|---|---|
| GET /api/projects/getList | List ProjectSummary đã lọc VIEW_PROJECT. |
| GET /api/projects/{id} | ProjectSummary cùng số liệu DB, thiếu404/không quyền403. |
| POST /api/projects/create | projectName bắt buộc tối đa100, projectKey bắt buộc tối đa10, description nullable tối đa255; trả200 ProjectSummary. |
| PATCH /api/projects/{id} | projectName + description; giữ key/lead, trả200 ProjectSummary. |
| DELETE /api/projects/{id} | Thành công200 rỗng; bị tham chiếu409. |

ProjectSummary giữ các field cũ và thêm issueCount, memberCount, sprintCount, activeSprintName nullable. Đếm tại DB theo tập project IDs đã qua kiểm quyền với bốn query group, không fetch mọi issue hay gọi API mỗi dòng. memberCount chỉ đếm project_members, lead hiển thị riêng; không coi lead chưa có membership là một thành viên đã được thêm.

Thiếu query result của count trên project không có dòng dữ liệu cho ra0; lỗi DB không được ngụy tạo thành0. Với backend cũ thiếu field, FE để dấu —, không hiển thị số giả. Bản demo giữ descriptionLimit1000; adapter API dùng255 theo schema hiện có.

## Đồng thời và cache

- Project mutation dùng connectedMutation, giữ Web Lock chung với login/logout. `/auth/me` được kiểm dưới khóa; userId khác người khởi tạo thì dừng trước ghi.
- Nếu access cần refresh thì khôi phục trước dispatch và kiểm user lại; business mutation chỉ gửi một lần, không replay sau401/409/timeout/5xx.
- Mỗi form giữ scope mount/generation/actor. Kiểm scope trong khóa và trước/sau invalidate; phản hồi cũ sau đổi phiên không toast key, điều hướng hoặc điền form trong tài khoản mới.
- Trước completion còn kiểm lại /auth/me dưới khóa sau refetch, vì cookie có thể đã đổi trước lúc BroadcastChannel tới tab cũ. Callback UI đồng bộ chạy trong khóa nếu actor/scope vẫn đúng; không gửi lại mutation.
- Browser thiếu Web Locks bị từ chối mutation với thông báo rõ; Chromium đã kiểm. Không tuyên bố mọi browser hỗ trợ ghi khi chưa kiểm. Backend vẫn quyết định quyền; khóa browser không thay thế JWT/FK/transaction.
- Không thêm version cho project metadata: hai người cùng sửa tên/mô tả vẫn có thể theo commit sau. Xung đột issue version/WIP thuộc phần kế tiếp, không suy từ project này.
- Confirm/pending bảo vệ double-click ở form tạo/xóa. Key kiểm trùng tại service + unique DB; không cấp quyền tạo cho PM hoặc tài khoản mới chỉ để nút hiện.

## Chạy và kiểm

Giữ cấu hình phần 1: FE BACKEND_API_URL phía server → Spring Boot8080 → PostgreSQL DB demo riêng với ddl-auto=validate. Source có thể chạy trên máy khác theo RUN_AND_MIGRATE.md; không copy credential máy gốc.

```powershell
npx tsc --noEmit
npm run test:connected
npm run test:planning
npm run test:ui-demo
$env:NEXT_DIST_DIR='.next-connected-build'
npm run build
npm run start -- --hostname 127.0.0.1 --port 3130
```

`tests/connected-projects.browser.cjs` dùng Playwright đã cài (hoặc PLAYWRIGHT_MODULE) và CHROMIUM_PATH tùy chọn; CONNECTED_CREDENTIALS là file local `{password, users:[{id,email,fullName,role}], projects:[{id,key,name}]}`, CONNECTED_OUTPUT là thư mục kết quả. Cần persona SYSTEM_ADMIN/DEVELOPER và project SHOP có dữ liệu, PORTAL chỉ PM/admin được xem. File/script chuẩn bị cụ thể trên máy gốc ở outputs/backend-integration, không nằm trong Git vì có cấu hình dữ liệu local. Máy kia tự tạo persona/DB của mình hoặc bổ sung bootstrap theo plan đã chốt.

Script test tạo project giả lập và xóa project rỗng sau kiểm; kịch bản phản hồi chậm có thể để lại project kiểm thử trong DB demo. Không chạy trên DB người dùng thật. Script auth phần1 vẫn là hồi quy riêng, không thay bằng kết quả project.

## Luồng người dùng kiểm trên máy gốc

1. Mở http://127.0.0.1:3130/app/sign-in; login admin.demo@example.test với password trong outputs/backend-integration/credentials.local.json. Không dùng credential này trên môi trường công khai.
2. Dự án: chuyển bảng/thẻ, tìm SHOP/CARE. Mở SHOP để thấy số công việc/thành viên/sprint thực, rồi F5.
3. Tạo dự án → nhập tên/mã/mô tả → tạo: tới tổng quan ID mới, số liệu0. Thử mã trùng để kiểm409 và form giữ nội dung.
4. Cài đặt → đổi tên/mô tả → Hủy để kiểm draft; đổi lại → Lưu → F5, tên/mô tả mới còn, key không đổi.
5. Vùng nguy hiểm → Xóa → nhập đúng key. Dự án rỗng xóa được và về list; SHOP có liên kết báo409 và vẫn còn dữ liệu.
6. Login dev.demo@example.test: không có nút tạo/xóa, settings SHOP chỉ đọc, PORTAL bị từ chối. PM có UPDATE_PROJECT của project được gán nhưng không tự có CREATE/DELETE toàn cục.

## Điều phối với máy kia

Máy này đã thay đổi server.ts: protectedAction/projectWrite, Origin cho mọi project mutation, Bearer cho protected writes, field allowlist và response200 rỗng/204. Patch Notification B0 phải dựa phiên bản mới, không thay lại auth/proxy. `connectedMutation` có thể dùng lại cho notification mutations khi đã xét actor/route theo plan của họ; shared transport vẫn do owner ghép patch riêng.

Project layout `/app/projects/[projectId]` đã có gate/context và nav overview/settings. Máy kia thêm reports/page dưới layout này bằng domain riêng; không tạo layout trùng hoặc viết lại project queries/shell. Nếu cần nav reports/bell thì gửi patch wiring nhỏ.

## Giới hạn

Không nâng schema, không thêm template Scrum transaction/đổi lead/cascade nghiệp vụ, chưa benchmark tải lớn hay chứng minh mọi interleaving. Test unit/mock khác HTTP/DB/browser thật; xem báo cáo đợt trong outputs/backend-integration/projects để biết lượt kiểm cuối và review.
