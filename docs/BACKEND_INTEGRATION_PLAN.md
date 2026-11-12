# Kế hoạch nối giao diện với backend và dữ liệu demo

Ngày 12/11/2026. Người dùng đã chốt triển khai từng phần, tự test rồi bàn giao để kiểm tra trước phần tiếp theo. Phần 1 (schema mới, DTO/context, phiên và danh sách project chỉ đọc) được bàn giao trong CONNECTED_PART1.md; các phần còn lại chưa được coi là đã nối backend.

## Mục tiêu

Giữ thiết kế giao diện đã duyệt, thay nguồn dữ liệu và hành động bằng backend thật. Dữ liệu tồn tại sau refresh/khởi động lại; backlog, board, issue detail, notification và báo cáo phản ánh cùng nghiệp vụ. Demo là dữ liệu giả lập có chủ đích trong PostgreSQL, không phải số liệu tự sinh trong component.

Không nâng framework, không dùng sub-agent. Mỗi đợt phải đi hết đường đọc → thao tác → lưu DB → đọc lại → kiểm tra → commit trước khi chuyển đợt tiếp theo. Giữ nguyên mọi thay đổi đang có chưa commit; không đưa các file log mở preview vào commit.

## Bằng chứng hiện trạng

- `src/features/ui-demo/provider.tsx:40`: DemoProvider tạo state từ fixture và chỉ giữ trong bộ nhớ. `useDemo` tại dòng 95 được các màn sử dụng trực tiếp; không thể chỉ đổi base URL để toàn bộ UI trở thành ứng dụng thật.
- `app/ui-review/layout.tsx:12`: preview trả 404 ở production. Cần tuyến ứng dụng thật, không bỏ guard rồi đem nguyên phiên demo lên production.
- `src/lib/api-client.ts:16`: client cũ đọc access token trong localStorage; các hook login/register còn ghi cookie bằng JavaScript. Chưa có luồng refresh chung.
- `app/api/[[...route]]/route.ts:12`: catch-all API cũ đang trả 404. Route mới phải có đường dẫn rõ và kiểm tra ưu tiên route.
- `src/features/backlog/api.ts:19`: loadPlanning đã gọi Spring Boot và map DTO; tái sử dụng hợp đồng/backlog logic phù hợp, không giữ thêm bản sao state máy chủ trong DemoProvider.
- BE `src/main/java/com/example/jira/dto/issue/IssueResponse.java:24`: trả statusName/issueTypeName nhưng thiếu statusId/issueTypeId. Không suy ID từ tên vì đổi tên hoặc tên trùng có thể làm cập nhật sai.
- BE `controller/auth/AuthController.java:44`: `/auth/me` trả `{user: UserSummary}`; chưa có context quyền riêng cho phiên và project.
- BE `docs/BOARD_CARDS_API.md:9`: board trả issue của cả project; `expectedVersion` và nhánh 409 tại dòng 14–24 đã có.
- BE `docs/SCRUM_REPORT_API.md:13`: burndown là chuỗi sự kiện; lịch sử không có không được tự lấp thành số 0.
- BE `docs/RUN_AND_MIGRATE.md:20`: thiếu baseline SQL đầy đủ cho DB mới. Script 001..006 chưa thay thế toàn bộ quy trình bootstrap.

Các đường dẫn BE ở trên tính từ `work/jira`; đường dẫn FE tính từ `work/jira_fe`.

## 1. Chốt hợp đồng và chuẩn bị môi trường

### 1.1 Kiểm tra schema trước khi khởi động bản tích hợp

- Đầu vào: cấu hình DB hiện có, metadata schema, migration 001..006 và entity BE. Chỉ đọc tên DB/schema/version; không ghi hoặc đưa password vào log.
- Dự kiến thêm migration baseline cho cài mới và sổ theo dõi migration. Đối chiếu DB hiện có trước khi đánh dấu baseline; không coi một DB có vài bảng là đã đủ schema.
- Chạy thử migration trên DB mới và bản sao DB hiện có trước. DB có dữ liệu cần backup và kiểm đích trước khi áp dụng; không dùng create/create-drop hoặc seed reset lên DB đó.
- Sau migration, chạy Hibernate validate. Nếu thiếu bảng/cột/index thì dừng để xử lý, không âm thầm đổi sang update.
- Bảng nghiệp vụ không đổi ở bước đọc hiện trạng. Nếu cần sửa schema ngoài baseline/migration đã chốt thì ghi rõ sai khác trước khi triển khai.

### 1.2 Bổ sung DTO thiếu, giữ API cũ tương thích

- Sửa `IssueResponse` và `IssueMapper.toResponse`: thêm statusId/issueTypeId nullable lấy trực tiếp từ quan hệ issues với issue_statuses/issue_types; giữ các trường tên đang có. Hàm chỉ map dữ liệu, không ghi DB.
- Thêm API context người đăng nhập: thông tin tài khoản, quyền toàn cục và quyền hiệu lực của project được yêu cầu. projectId là projects.project_id, actorId lấy từ JWT; không nhận actorId tùy ý từ client.
- Hàm dự kiến `getAccountContext(projectId)` đọc users, user_role_assignments, user_roles, role_permissions, permissions, projects và project_members theo logic quyền BE hiện có. Thiếu phiên → 401; project không tồn tại → 404; không có quyền đọc project → 403. Không trả toàn bộ role/membership của người khác.
- Context giúp hiển thị UI; mọi mutation vẫn đi qua security BE. Không thêm quyền chỉ để giao diện hiện được một nút.
- Lập bảng đối chiếu từng màn với method/path/request/response/quyền/nhánh lỗi; đánh dấu trường UI chưa có API như avatar thay vì tự giả vờ lưu thành công. Chốt cách biểu diễn null, ngày giờ, enum, page/size và version.
- Lưu OpenAPI/collection kiểm chứng cục bộ. Chưa có yêu cầu xuất bản Postman workspace hoặc gửi dữ liệu ra dịch vụ ngoài.

## 2. Đăng nhập và nguồn dữ liệu máy chủ

### 2.1 Luồng phiên đề xuất

Đường chạy: browser → Next Route Handler cùng origin → Spring Boot → PostgreSQL. Next chỉ làm cầu nối HTTP và giữ cookie; nghiệp vụ và kiểm quyền ở Spring Boot.

- Dự kiến thêm `app/api/backend/auth/{login,register,me,refresh,logout}/route.ts`, proxy nghiệp vụ có danh sách đường dẫn/phương thức cho phép và helper `backendFetch` chạy phía server. Không nhận URL upstream tùy ý từ browser.
- Login nhận form email/password, gọi `/api/auth/login`. BE kiểm users, mật khẩu, enabled, auth_version và tạo refresh_tokens theo luồng hiện có. Thành công Next đặt access/refresh cookie HttpOnly; Secure khi chạy HTTPS, SameSite và thời hạn phù hợp token. Không trả token cho JavaScript, không ghi localStorage hoặc log body đăng nhập.
- Request nghiệp vụ đọc access cookie phía Next rồi gắn Bearer khi gọi Spring. Không cache response cá nhân bằng cache dùng chung. Proxy giữ đúng status, JSON, 204 và multipart; upload không bị ép Content-Type JSON.
- Request thay đổi dữ liệu, kể cả refresh/logout, kiểm Origin theo cấu hình tin cậy; không mở CORS tùy ý cho cookie. BE vẫn nhận JWT, không chuyển thành tin cookie do browser gửi trực tiếp.
- `useSession` lấy `/me` và context quyền trước khi dựng màn được bảo vệ. Không có phiên chuyển tới đăng nhập và giữ đường quay lại; 403 hiện thiếu quyền, không xóa phiên.
- Khi API trả 401, client gọi `refreshSessionOnce`: gom các request đang chờ và phối hợp các tab bằng Web Locks/BroadcastChannel, chỉ gửi thông báo trạng thái phiên, không truyền token. Route refresh đọc refresh cookie mới nhất, gọi BE rotation rồi thay cookie trước khi cho request chạy tiếp.
- BE refresh giữ thứ tự khóa user → refresh token như hiện có, kiểm revoked/expired/family rồi ghi token cũ và mới trong transaction. Nếu thất bại xác thực thì xóa phiên, hủy request chờ và về login. Lỗi mạng tạm thời hiển thị lỗi kết nối, không tự coi là sai mật khẩu.
- Mỗi request chỉ thử lại tối đa một lần sau 401 xác thực. Không tự retry mutation sau timeout/5xx/409 vì server có thể đã ghi. SSR không tự rotation song song; chuyển về bước khôi phục phiên phía client. Trình duyệt thiếu cơ chế phối hợp tab cần fallback rõ và được test; không tuyên bố chống trùng refresh đa tab nếu chưa chứng minh.
- Logout gọi BE thu hồi family, xóa cookie/cache và thông báo tab khác bỏ phiên. Nếu mạng lỗi, vẫn đóng phiên cục bộ nhưng báo chưa xác nhận thu hồi phía server; không thông báo revoke thành công giả.
- Đổi mật khẩu/disable làm auth_version tăng như hiện có; UI xử lý phiên cũ bị vô hiệu hóa. Không đổi security semantics chỉ để giữ trang đang mở.

Lý do chọn: dùng lại JWT/refresh BE và TanStack Query đã có; cookie HttpOnly tránh để JS đọc token. Cầu nối cùng origin giúp SSR/client có một cách xác thực. Đây là thay đổi cần kiểm riêng, không chỉ thêm interceptor vào demo.

### 2.2 Tách component trình bày khỏi demo

- Tạo lớp `features/*/api`, mapper DTO → view model và query/mutation hooks cho từng miền. Tách các phần hiển thị trong `ui-demo/screens` nhận dữ liệu/action qua props hoặc hook theo miền; không dựng một provider tải toàn bộ DB.
- Giữ `/ui-review` để duyệt fixture. Tuyến thật dùng shell/component trình bày chung, không có chọn persona, reset seed hoặc scenario toolbar. Kiểm inventory route `/projects`, `(dashboard)` và `(auth)` trước khi gắn page để tránh hai page cùng URL.
- Query key chứa user/session scope, projectId, boardId, sprintId và filter liên quan. Logout/đổi tài khoản hủy request và clear cache để không ló dữ liệu phiên trước.
- Dữ liệu UI cục bộ chỉ gồm modal, bộ lọc, bản nháp form và trạng thái kéo; dữ liệu DB do query cache quản lý. Lỗi API hiển thị lỗi/empty/403/404 phù hợp, không fallback fixture.
- Thành công mutation dùng response máy chủ rồi invalidate đúng detail/list/backlog/board/report. Chờ server xác nhận trước khi đóng form quan trọng. Khóa nút khi pending, giữ bản nháp khi lỗi.

## 3. Nối một luồng hoàn chỉnh trước

### 3.1 Dự án → issue → backlog

- `useProjects` lấy danh sách có quyền; `useProject(projectId)` đọc đúng ID trên URL. Key như SCR-12 chỉ để hiển thị/tìm kiếm, không thay cho projects.project_id hoặc issues.issue_id.
- `useCreateIssue` nhận projectId từ trang, typeId/statusId từ cấu hình thực của project, assigneeId từ thành viên và parentIssueId từ issue cùng project. FE kiểm trường bắt buộc; BE kiểm lại ID, quyền và quan hệ, thất bại không đóng form.
- Dùng luồng BE hiện có ghi issues, cấp issue number/counter và key, ghi lịch sử/thông báo nếu nghiệp vụ yêu cầu. FE không tự sinh key/version và không thay null bằng user ID 0.
- Backlog dùng lại `loadPlanning`/mapper sau khi bổ sung DTO. Ưu tiên chỉ tải sprint mở cần thiết; issue search dùng phân trang BE, không tải cả project để giả phân trang.
- Sau create/update, tải lại issue detail và các danh sách bị ảnh hưởng. Kiểm refresh trình duyệt và đăng nhập lại vẫn thấy dữ liệu đã lưu.

### 3.2 Sprint và thứ tự backlog

- `startSprint(sprintId)` lấy ID sprint đã chọn; BE kiểm FUTURE, quyền, ngày và một ACTIVE/project trước đổi state và tạo START snapshot. ACTIVE/CLOSED không cho dùng hành động của FUTURE.
- `completeSprint(sprintId, targetSprintId)` gửi đúng lựa chọn chuyển việc chưa xong. BE chốt snapshot trước chuyển unfinished trong transaction; FE không tự xóa sprint hoặc nhân bản issue.
- Reorder gửi đủ ID của scope backend yêu cầu. Nếu đang lọc thì khóa reorder hoặc xây đủ danh sách đã được kiểm chứng; không gửi subset làm mất phần bị ẩn.
- Thành công invalidate sprint/product backlog/board/summary/velocity. Timeout kiểm trạng thái mới trước khi người dùng quyết định thử lại; không replay mù thao tác start/complete/create.

### 3.3 Board và đồng thời

- `useBoardCards(boardId, sprintId)` lấy board/columns/mapping, cards và sprint backlog. boardId thuộc boards, columnId thuộc board_columns, sprintId thuộc sprints; kiểm project khớp trước ghép dữ liệu.
- Hiển thị phần giao issueId giữa cards của project và backlog sprint đã chọn. Khi đổi sprint hủy/bỏ response cũ; status chưa mapping đưa vào trạng thái cần cấu hình, không gán đại cột đầu.
- `moveIssue` gửi `{columnId,statusId,position,expectedVersion}`. Position là thứ tự toàn cột theo hợp đồng BE, không lấy index của tập đang lọc/sprint rồi coi là index toàn project. Nếu cần chuyển chỉ số từ phần hiển thị sang toàn cột phải viết mapper và test; lọc đang làm phạm vi mơ hồ thì khóa reorder và giải thích.
- Cột nhiều status cho người dùng chọn status hợp lệ. BE dùng workflow/WIP/lock/version sẵn có; FE không lặp toàn bộ nghiệp vụ thành nguồn quyết định thứ hai.
- Bản đầu chờ response trước chốt vị trí, hoặc chỉ preview drag tạm thời. 409 tải lại card/cột và báo lý do; không ghi đè cache bằng state cũ hoặc tự gửi version mới để thắng người khác.
- Kiểm hai browser context kéo cùng version: chỉ một lượt ghi, lượt còn lại thấy xung đột; kiểm hai card tranh chỗ WIP cuối. Read query cập nhật khi focus và polling có giới hạn ở màn cần theo dõi; chưa gọi đó là realtime push.

## 4. Nối phần còn lại theo miền

| Đợt | Thứ tự chạy và dữ liệu | Điều kiện/kết quả cần giữ |
|---|---|---|
| Comment/attachment | Issue detail → list → tạo/sửa/xóa; bảng issue_comments/issue_attachments và storage đã cấu hình | Author/uploader lấy từ phiên; version comment dùng response thật; kiểm ownership, 409, file type/size; chỉ báo upload thành công khi server trả metadata. Remote storage lỗi không giả tệp đã lưu/xóa hoàn toàn. |
| Member/settings | Project → quyền → members/types/boards/columns/mapping/workflow → mutation → refetch | project_members.role khác user_role_assignments; bảo vệ lead/PM cuối theo BE; đọc role IDs từ server; không tự cấp SYSTEM_ADMIN. |
| Inbox | Phiên → danh sách theo recipient → đọc/xóa → unread count | Notification do BE tạo từ hành động thật; không tự thêm một bản ở FE; chỉ cập nhật đúng inbox phiên hiện tại. |
| Reports | Chọn project/sprint → summary/burndown/velocity → map biểu đồ | Giữ null/unavailable; hiện mốc thời gian và đơn vị; điểm hoàn thành CLOSED lấy snapshot, không tính lại từ issue hiện tại. |
| Account/admin | Context quyền → profile/password hoặc admin pages → mutation → context/cache mới | User ID quản trị khác actor JWT; 403 giữ phiên; admin cuối/disable xử lý lỗi BE; audit chỉ đọc bản ghi BE, không tự tạo feed thành công ở FE. |

Luồng cụ thể của từng mutation được ghi trong bảng hợp đồng và giải thích ở comment tiếng Việt trước khi code đợt tương ứng. Không mở rộng thành tính năng mới (email recovery, avatar upload, realtime...) nếu chưa chốt riêng.

## 5. Dữ liệu giống một sản phẩm đang dùng

### Bộ dữ liệu đề xuất

| Thành phần | Quy mô và nội dung |
|---|---|
| Người dùng | 8 tài khoản giả lập có tên/avatar chữ cái: admin, PM, BE, FE, QA, designer và thành viên ngoài project; quyền riêng theo từng project. |
| Dự án | 3 dự án: website thương mại điện tử, ứng dụng hỗ trợ khách hàng, dự án mới chưa có issue. Nội dung tập trung vào các tính năng API hỗ trợ. |
| Issue | Khoảng 90 issue có tiêu đề, mô tả/yêu cầu chấp nhận, loại, ưu tiên, estimate, assignee/reporter và parent hợp lệ. Có việc chưa giao/chưa estimate; không thêm trường due date/label/epic khi API chưa hỗ trợ. |
| Sprint | Project chính có 3 CLOSED, 1 ACTIVE và 1 FUTURE; mục tiêu và ngày phù hợp. Việc chưa hoàn thành có câu chuyện chuyển tiếp, không xuất hiện ở hai sprint mở. |
| Board | 4–5 cột, mapping status thật, WIP vừa phải; phân bố việc có TO_DO/IN_PROGRESS/DONE. Ca lỗi mapping/WIP chỉ ở fixture kiểm thử riêng, không làm màn mặc định toàn lỗi. |
| Lịch sử | Comment trao đổi có nội dung nghiệp vụ, notification đúng recipient và audit đúng actor/action; timestamp có trình tự, không tất cả cùng thời điểm seed. |
| Báo cáo | Snapshot commitment/completion và event burndown nhất quán với kịch bản từng sprint; velocity có vài sprint đủ khác biệt để đọc được. Một sprint có thiếu lịch sử để kiểm trạng thái unavailable riêng. |
| Attachment | Một số file mẫu hợp lệ, không chứa dữ liệu cá nhân thật; chỉ đưa vào DB sau khi đã có object storage hoạt động. Chưa có storage thì hiển thị empty state và lỗi cấu hình rõ. |

### Cách tạo và chạy lại

- Dự kiến thêm `DemoDatasetSeeder`, builder kịch bản và `verifyDemoDataset`. Chỉ bật bằng profile/flag rõ ràng trên DB demo riêng, ví dụ jira_demo; mặc định tắt. Không nhúng mật khẩu vào mã nguồn; lấy credential demo từ cấu hình cục bộ và hash bằng luồng BE.
- Thứ tự: kiểm DB đích/schema/migration → cấu hình role/permission/type/status/workflow → users → projects/members → boards/columns/mapping → issues → sprint membership/rank → lịch sử/snapshot → comments/notification/audit → kiểm tổng và quan hệ.
- Đọc/ghi theo foreign key thật, không giả định ID 1 luôn là admin/TODO. Dùng khóa dữ liệu demo ổn định/manifest để nhận diện bộ seed. Nếu đã seed đúng phiên bản thì không nhân bản; phiên bản khác dừng và báo cách cập nhật, không tự xóa dữ liệu người dùng vừa tạo.
- Dữ liệu lịch sử giả lập được tạo trên DB demo bằng builder có kịch bản và nguồn gốc rõ, cùng các bảng snapshot/event thật. Không sửa timestamp hoặc bù lịch sử DB đang dùng để giả thành dữ liệu vận hành có thật. Bộ kịch bản phải đối chiếu thuật toán báo cáo hiện có và kiểm invariant; không lấy vài con số cố định rải trong FE.
- Mutation sau seed chạy API/service thật để lịch sử/thông báo tiếp tục tăng bình thường. Kiểm chứng bằng đổi status/estimate rồi đọc lại metrics; đổi/xóa issue cũ không sửa completion snapshot đã chốt.
- Reset là lệnh riêng chỉ dành DB demo sau khi kiểm đích, không có reset tự động lúc app khởi động. DB hiện tại của người dùng được giữ nguyên cho đến khi có plan áp dụng riêng.

## 6. Kiểm tra và điều kiện hoàn thành

1. Contract: kiểm request/response trên HTTP thật, ID/null/enum/page/204/multipart, 400/401/403/404/409. Không đổi API chỉ để test xanh.
2. Luồng browser thật: login → chọn project → tạo/sửa issue → đưa vào sprint → start → kéo board → comment → complete → xem reports. Refresh, logout/login và khởi động lại vẫn giữ dữ liệu.
3. Phân quyền: admin/PM/developer/outsider; truy cập URL/API trực tiếp, project khác và tab đăng nhập tài khoản khác; không chỉ kiểm nút ẩn.
4. Lỗi: token hết hạn, nhiều request/tab refresh, network timeout sau mutation, upload lỗi, request chậm trả về sau khi đổi project, 409 và submit hai lần.
5. Đồng thời: cùng issue/version và tranh WIP trên DB thật; kiểm riêng giới hạn reorder backlog đang dùng last-write-wins, không trình bày là có revision nếu BE chưa có.
6. Dữ liệu: không FK mồ côi, không hai ACTIVE/project, key/counter không trùng, thứ tự hợp lệ, report snapshot khớp kịch bản, inbox đúng người. Trang rỗng không hiện số giả.
7. Build/typecheck và test hồi quy phù hợp FE/BE; kiểm bản production để phát hiện route bị guard hoặc vô tình còn dùng DemoProvider.

Mỗi đợt ghi rõ test đã chạy/đạt/chưa kiểm, commit riêng sau khi đạt. Không tuyên bố bao quát mọi bug hoặc mọi xen kẽ đồng thời. Chưa triển khai ở thời điểm viết plan này.

## Tài liệu tham khảo kỹ thuật

- Next.js authentication: https://nextjs.org/docs/app/guides/authentication — nguyên tắc lưu phiên/cookie và kiểm quyền server. Dự án đang dùng Next 14; khi code phải áp dụng API đúng phiên bản đã cài, không chép API bản mới hoặc nâng framework ngầm.
- TanStack Query optimistic updates: https://tanstack.com/query/latest/docs/framework/react/guides/optimistic-updates — cancel/snapshot/rollback/refetch khi dùng optimistic mutation; bản đầu chọn cập nhật thận trọng cho thao tác dễ xung đột.

## Phạm vi triển khai đã chốt theo từng phần

Người dùng yêu cầu làm từng phần, tự test và cung cấp luồng kiểm tra rồi dừng để người dùng duyệt kết quả. Phần 1 tách nhỏ thành hợp đồng DTO/context, baseline/migration trên DB riêng, xác thực/query, tài khoản và danh sách project chỉ đọc. Sau khi người dùng kiểm phần này mới tiếp tục project → issue → backlog, sprint/board rồi các miền còn lại. Thay đổi đáng kể ngoài plan cần trình bày lại theo AGENTS.md.
