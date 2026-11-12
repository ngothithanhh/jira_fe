> Tài liệu lịch sử của đợt UI. Giao diện đã hoàn thành và đang nối backend; nhiệm vụ mới/nhánh làm việc xem [REMOTE_COLLABORATION.md](REMOTE_COLLABORATION.md).

# Đặc tả bàn giao UI — Hệ thống quản lý dự án

Ngày lập: 12/11/2026. Đọc độc lập được, không cần lịch sử chat. Tài liệu này mô tả công việc cần triển khai; không phải báo cáo các màn mới đã hoàn thành.

## 0. Yêu cầu gốc, phạm vi và cách đọc nguồn

Hai yêu cầu gần nhất của người dùng:

> “giao diện trước đi, nối be để sau”

> “viết cụ thể hơn kèm trích dẫn nhé, mình cho agent khác chưa có context làm giao diện”

Mục tiêu: hoàn thiện giao diện tiếng Việt cho đủ 19 nhóm chức năng ở mục 3, điều hướng và thao tác thử được bằng dữ liệu mẫu thống nhất. Ưu tiên tiếp tục phong cách Jira của backlog đã làm, không thiết kế lại thành landing page/dashboard quảng bá.

**Trong đợt này:** code FE, state mẫu, form/modal/panel, kéo thả, lọc/phân trang cục bộ, chart, responsive và trạng thái lỗi/rỗng/tải. **Phần tích hợp BE là giai đoạn sau:** không sửa Java/DB, không thêm API, không bật refresh JWT thật, không gọi Cloudinary/SMTP.

Quy ước nguồn:
- **[U]**: yêu cầu người dùng được chép nguyên văn ở trên và các ràng buộc bàn giao tại mục 1.
- **[Fxx]**: file FE đã đọc tại snapshot fc5c366 + thay đổi chưa commit, có link file/dòng ở cuối tài liệu.
- **[Bxx]**: tài liệu nghiệp vụ backend cục bộ; chỉ đọc để UI không mô phỏng sai quy tắc.
- **[Jxx]**: tài liệu Atlassian chính thức, tham khảo mẫu tương tác. Không coi toàn bộ Jira là phạm vi phải clone.
- Các tên DemoProvider, AppShell, route mới và action ở dưới là **thiết kế đề xuất**, chưa tồn tại trừ khi được đánh dấu “đã có”.

Dòng dẫn có thể thay đổi khi agent sửa file; dùng tên export/hàm để tìm lại. Đường dẫn trong cây file là tương đối từ repo FE, các link nguồn là tuyệt đối trên máy hiện tại. Nếu đổi máy, thay phần root bằng repo tương ứng.

## 1. Workspace, quyền triển khai và bảo toàn thay đổi

- Workspace: C:/Users/Admin/Documents/Codex/2026-08-27/https-github-com-ngothithanhh-jira-https
- FE: C:/Users/Admin/Documents/Codex/2026-08-27/https-github-com-ngothithanhh-jira-https/work/jira_fe; remote origin là https://github.com/ngothithanhh/jira_fe.git.
- BE: C:/Users/Admin/Documents/Codex/2026-08-27/https-github-com-ngothithanhh-jira-https/work/jira; chỉ tham khảo các tài liệu [B01]–[B08].
- Nền FE hiện tại: Next.js 14.2.35, React 18, TypeScript, Tailwind, Radix, React Hook Form/Zod, TanStack Query, thư viện kéo thả @hello-pangea/dnd. Dùng lại dependency đã có, không cần nâng framework hoặc dựng dự án mới. [F01]
- Người dùng yêu cầu **không dùng sub-agent**. Agent chính tự lập kế hoạch, thực hiện và kiểm tra.
- Quy trình người dùng đã gửi yêu cầu: “Chỉ thực hiện code sau khi người dùng đã chốt plan.” Việc yêu cầu viết bàn giao này chưa đồng nghĩa mọi thiết kế bên dưới đã được duyệt. Agent nhận việc kiểm tra người dùng đã chốt phạm vi nào; nếu chưa thì trình plan đợt đầu trước khi code.
- Không push remote khi chưa được yêu cầu. Đừng coi tài liệu này là ủy quyền deploy.
- Thêm comment tiếng Việt ở hàm/khối nghiệp vụ quan trọng, giải thích ID, điều kiện kiểm tra, kết quả và lý do xử lý. Không dùng comment chỉ đọc lại cú pháp.

Snapshot cần giữ, đã có trước khi viết bàn giao:
~~~
M  src/features/backlog/components/backlog-preview.tsx
M  src/features/backlog/components/backlog-view.tsx
M  src/features/backlog/components/planning-shell.tsx
M  src/features/backlog/model.ts
?? app/ui-review/layout.tsx
?? docs/UI_FIRST_PLAN.md
?? docs/UI_REVIEW_03_PLAN.md
?? src/features/backlog/components/planning-parts.tsx
?? src/features/backlog/components/review-provider.tsx
~~~
Chạy lại git status trước sửa. Không reset/restore hoặc ghi đè các file trên bằng HEAD. Đọc phần thay đổi hiện tại rồi phát triển tiếp; stage chính xác file thuộc đợt đã kiểm tra. UI_FIRST_PLAN.md là bản ngắn trước tài liệu này; UI_REVIEW_03_PLAN.md là plan cũ cho vài trang review, không phải bằng chứng các trang đó đã tồn tại. [F21]

**Nếu agent làm ở checkout/máy khác:** clone commit fc5c366 không có các file untracked và bản sửa dở bên trên. Cần nhận snapshot workspace hiện tại hoặc đối chiếu đủ các nguồn trước khi triển khai; không tưởng các file thiếu đã bị xóa có chủ đích. Các đường dẫn tuyệt đối trong citation dùng cho máy hiện tại, tên file tương đối và tên export ở mục 2 là chỉ dẫn để tìm lại ở máy khác.

## 2. Những gì có thật trong FE hiện tại

| Thành phần | Hiện trạng xác minh | Hành động cho agent |
|---|---|---|
| PlanningShell | Header/sidebar/phong cách Jira; menu dự kiến Board/Issues/Members/Settings, Reports đang disabled | Tái dùng hình thức, mở rộng menu theo route thật; không coi Link đã có nghĩa là trang đã có. [F03] |
| BacklogView | Search, lọc người nhận, nhóm sprint/backlog, create modal, complete dialog, panel, reorder | Giữ behavior; lấy đây làm màn chuẩn. [F04] |
| planning-parts | Person/Status/IssueType/IssueDetails dùng chung; details mới sửa mô tả/points | Mở rộng panel, tránh mỗi trang một form khác nhau. [F05] |
| ReviewProvider | Một PlanningData trong memory, actions demo, bọc luôn PlanningShell | Cần tách state khỏi shell để trang auth không có sidebar; chuẩn hóa state nhiều project. [F06] |
| BacklogPreview | Đọc data/actions từ useReview rồi render BacklogView | Giữ adapter này chạy trong quá trình chuyển đổi. [F07] |
| /ui-review/layout | Guard production notFound, cấp ReviewProvider | Giữ guard; các màn duyệt chỉ chạy development theo phạm vi hiện tại. [F08] |
| PlanningData/types | Issue có status/type dạng tên, sprint chỉ FUTURE/ACTIVE; array issue nằm trong từng nhóm | Đây là model cũ cần adapter, không đủ làm nguồn chuẩn cho UI hoàn chỉnh. [F09] |
| Fixtures | Project SCR, Sprint 03 ACTIVE, Sprint 04 FUTURE và issue mẫu tiếng Việt | Dùng làm dữ liệu khởi đầu, thêm các tình huống còn thiếu. [F10] |
| review model | Reorder theo toàn bộ scope; moveReviewCard mới chỉ ba status tên mẫu | Không dùng ba tên đó làm workflow cuối; thêm statusId/category. [F11] |
| BacklogConnected/Axios | Đang gọi Spring Boot thật, Axios tự gắn token và redirect 401 | Không import vào cây component demo; UI phải mở được khi BE tắt. [F12], [F13] |
| Task/project/member legacy | Nhiều hook còn mock localStorage; bulk task update gán cứng ID status | Chỉ tận dụng component thuần render sau khi tách data hook; không mang hai hệ state vào UI mới. [F14], [F15], [F16], [F17], [F18] |

Điểm lỗi thiết kế đã nhìn thấy cần tránh lặp:
- ReviewProvider.completeSprint hiện bỏ sprint khỏi array sau complete, làm mất CLOSED/history. UI mới phải giữ CLOSED. [F06]
- Status “hoàn thành” hiện suy từ regex tên trong planning-parts; dữ liệu mới dùng category DONE để tên “Đã nghiệm thu” vẫn có nghĩa hoàn thành. [F05], [B03], [B04]
- UI “workspace” cũ không phải thực thể nghiệp vụ riêng cần tạo thêm cho bản này; giao diện mới dùng Project.
- Tài liệu backend từng ghi “không có FE trong checkout” là nhận định theo phạm vi kiểm BE trước đó; thực tế FE đang ở work/jira_fe.

## 3. Ánh xạ đủ 19 nhóm UC vào màn hình

Đây là danh sách người dùng đã chốt về phạm vi hệ thống. Bảng mô tả UI cần bàn giao; trạng thái backend chỉ làm căn cứ nghiệp vụ. [U], [B01]

| UC | Nhóm | Màn/khu vực cần có | Thao tác phải bấm thử được |
|---|---|---|---|
| 01 | Quản lý tài khoản và xác thực | Sign-in, sign-up, menu tài khoản, đổi mật khẩu | Validation, vào phiên demo, đăng xuất, chuyển vai trò mẫu |
| 02 | Quản lý người dùng | Hồ sơ cá nhân; Admin → Người dùng | Sửa hồ sơ, tìm user, khóa/mở, gán role mẫu |
| 03 | Quản lý project | Danh sách, tổng quan, modal tạo/sửa/xóa | Tìm/chọn project, tạo project rỗng, đổi tên, confirm xóa |
| 04 | Quản lý thành viên project | Project → Thành viên | Tìm, thêm, đổi role, gỡ, nhận biết lead |
| 05 | Quản lý issue | Danh sách + panel chi tiết chung | Tạo/sửa/xóa, giao/bỏ giao, priority, points, parent |
| 06 | Quản lý comment và attachment | Tab/section trong chi tiết issue | Thêm/sửa/xóa comment; chọn/xem/bỏ tệp mẫu |
| 07 | Quản lý issue type | Admin → Issue type; Project settings → Issue type | CRUD chung, gán vào project, đổi mặc định |
| 08 | Quản lý status và workflow | Admin → Status/Workflow; settings xem mapping | CRUD trạng thái, thêm/xóa cạnh workflow, hiển thị chuyển hợp lệ |
| 09 | Quản lý role và permission | Admin → Roles & permissions; User roles | Chọn role, tick quyền, lưu/hủy, gán role user |
| 10 | Quản lý Scrum board | Board selector + settings board | Chọn/tạo/đổi tên/xóa board mẫu |
| 11 | Quản lý column và mapping status | Settings → Columns | Tạo/sửa/xóa/reorder cột, WIP, map/unmap status |
| 12 | Quản lý sprint | Backlog + sprint dialog + chọn lịch sử | Tạo/sửa/start/complete/xóa nháp; xem CLOSED |
| 13 | Quản lý sprint backlog | Các nhóm sprint trên Backlog | Thêm/gỡ issue, rank, tổng points |
| 14 | Quản lý product backlog | Nhóm Backlog của project | Tạo nhanh, tìm/lọc, rank, đưa vào sprint |
| 15 | Theo dõi/di chuyển issue trên board | Active board | Drag/drop, move menu, vị trí card, cảnh báo WIP/workflow |
| 16 | Tìm kiếm, lọc, phân trang issue | Issues toolbar/table | Keyword, status/type/assignee/priority/sprint, sort, page |
| 17 | Notification | Bell + Inbox | Unread, đọc một/tất cả, xóa, mở issue liên quan |
| 18 | Báo cáo Scrum | Reports tabs Summary/Burndown/Velocity | Chọn sprint, tooltip, legend, history unavailable |
| 19 | Quản trị hệ thống | Admin overview, audit, các tab cấu hình | Count từ state, tìm/lọc log, xem detail, 403 role không hợp lệ |

Không thêm màn Epic hierarchy riêng, release/worklog, billing, marketplace hoặc invite workspace chỉ vì template cũ có sẵn. Đây không phải phạm vi UI 19 nhóm đang bàn giao. Quên mật khẩu có thể để thông báo rõ “chưa có trong bản này”, không có nút gửi email giả.

## 4. Bố cục và quy chuẩn hình thức

Các thông số dưới lấy từ bản Jira đã chỉnh của chính repo, không phải tuyên bố token chính thức của Atlassian. [F02], [F03], [F04]

| Thành phần | Quy chuẩn |
|---|---|
| Header desktop | 56px; tên “Quản lý dự án”, chọn project, tạo issue nhanh, bell, user menu |
| Sidebar | 240px desktop; mobile dùng drawer, chọn Link xong đóng drawer |
| Màu | Nội dung trắng; sidebar #f4f5f7; text #172b4d; muted #6b778c; primary #0052cc; border #dfe1e6 |
| Typography | Font hệ thống như PlanningShell; tiêu đề issue 13px; toolbar/body 13–14px; tiêu đề trang khoảng 20–24px |
| Component | Button/input bo nhỏ khoảng 3px, không shadow dày, không gradient/hero/slogan |
| Mật độ | Row issue desktop tối thiểu 36px; mobile tăng khoảng chạm/cho wrap; truncate có title hoặc tooltip |
| Dialog/panel | Radix hiện có để giữ focus; Esc, cancel, save; dirty state; sheet chi tiết ở cạnh phải |
| Ngôn ngữ | Tiếng Việt nhất quán; Backlog/Sprint/Story points giữ khi cần; status màu + chữ, không chỉ màu |
| Preview badge | Nhãn “Dữ liệu mẫu” nhỏ, rõ, không banner chiếm phần lớn màn |
| Hành động | Primary rõ một thao tác chính; delete nằm menu/confirmation; có pending/error/success phù hợp |

Trang auth dùng nền đơn giản, form chính giữa và tên sản phẩm; không đặt sidebar dự án sau form login.

Ảnh cũ tham khảo: [desktop backlog], [F23], [mobile backlog], [F24]. Đây là ảnh của các lượt trước, không phải ảnh xác nhận code đang sửa dở. Ưu tiên UI_REVIEW_02 và component hiện tại nếu ảnh cũ có trang trí đã bị bỏ. [F02]

Atlassian tham khảo cách tổ chức sprint/backlog và cột/workflow; không chép logo hoặc source đóng. Giữ THIRD_PARTY_NOTICES.md khi tái sử dụng code có sẵn. [J01], [J02], [F20]

## 5. Route và cấu trúc file đề xuất

### 5.1 URL cho bản duyệt

Giữ /ui-review/backlog đang có làm alias dẫn về backlog project mẫu để link cũ không 404.

| URL dự kiến | Nội dung/layout |
|---|---|
| /ui-review/sign-in, /ui-review/sign-up | Auth layout, không sidebar |
| /ui-review/projects | Danh sách project, global shell |
| /ui-review/projects/{projectId}/overview | Tổng quan dự án |
| /ui-review/projects/{projectId}/backlog | Backlog/sprint planning |
| /ui-review/projects/{projectId}/board | Board, boardId/sprintId ở query nếu cần |
| /ui-review/projects/{projectId}/issues | Table + filter/page |
| /ui-review/projects/{projectId}/members | Thành viên |
| /ui-review/projects/{projectId}/settings | Tab thông tin/type/board/columns |
| /ui-review/projects/{projectId}/reports | Summary/Burndown/Velocity |
| /ui-review/notifications | Inbox theo demo user |
| /ui-review/account | Hồ sơ và đổi mật khẩu |
| /ui-review/admin | Overview |
| /ui-review/admin/users | Users + global role assignment |
| /ui-review/admin/roles | Role-permission matrix |
| /ui-review/admin/issue-types | Type catalog |
| /ui-review/admin/statuses | Status catalog |
| /ui-review/admin/workflows | Workflow rules |
| /ui-review/admin/audit | Logs/filter/detail |

Issue panel được điều khiển bằng query issueId, ví dụ /ui-review/projects/1/board?issueId=24. Link từ notification cũng dùng cách này. Xóa/đóng panel bỏ issueId nhưng giữ filter/sprint/page đang chọn. Direct URL project/issue sai phải có màn not found; không tự fallback sang project 1.

Các route đều là đề xuất; agent có thể dùng App Router route groups để dùng layout chung. Route group không đổi URL. /ui-review root chỉ cấp data provider + guard production, không render cứng PlanningShell cho mọi trang; hiện trạng đang bọc shell cần tách. [F06], [F08]

### 5.2 Các file nên thêm/tái dùng

~~~
src/features/ui-demo/
  types.ts                 # model chuẩn, không phụ thuộc DTO BE
  fixtures.ts              # seed có các tình huống UI
  actions.ts               # pure transitions + validation
  selectors.ts             # project/backlog/board/report view models
  provider.tsx             # useReducer/useDemo, reset, selected demo user
  review-adapter.ts        # chiếu model mới sang PlanningData cũ

src/components/project-ui/
  app-shell.tsx            # tái dùng style PlanningShell
  page-heading.tsx
  filter-bar.tsx
  state-view.tsx           # loading/empty/error/403/404
  issue-details-panel.tsx
  confirm-dialog.tsx

src/features/{projects,board,issues,members,reports,notifications,admin}/components/
  ...                      # component mới nhận view model/actions từ demo

app/ui-review/...
tests/ui-demo-model.test.mjs
docs/UI_DELIVERY.md
~~~

Tên file có thể điều chỉnh theo quy ước repo sau khi đọc code. Không thay thế hàng loạt src/features/*/api hoặc src/lib/mock để chạy được UI demo. Tách component thuần render khỏi hook gọi dữ liệu trước khi reuse. Các primitive Radix có sẵn trong src/components/ui. [F22]

## 6. Model, fixture và quy tắc cập nhật

### 6.1 Nguồn dữ liệu duy nhất

Đề xuất DemoState chuẩn hóa, giữ quan hệ bằng ID:
~~~
DemoState = {
  session: { userId, isDemo: true } | null,
  projectsById, usersById,
  issuesById, sprintsById, boardsById, columnsById,
  statusesById, issueTypesById, rolesById, permissionsById,
  memberships, userRoleAssignments, rolePermissions, projectIssueTypes,
  sprintIssues, boardRanks, columnStatuses, workflowRules,
  commentsById, attachmentsById, notificationsById, auditEvents,
  sprintSnapshots, burndownEvents
}
~~~
Mỗi issue chỉ có một bản ghi trong issuesById; không lưu ba object độc lập cho backlog/board/detail. Selector tạo danh sách hiện tại, không mutation trong render. Review adapter tạo PlanningData tạm thời từ state chuẩn cho BacklogView; **không giữ cả DemoState và PlanningData bằng hai useState riêng**. [F09]

ID:
- projectId: dự án.
- issueId: bản ghi công việc; khác issueNumber và issueKey.
- sprintId thuộc một project; boardId thuộc một project; columnId thuộc một board.
- statusId/category tách khỏi tên; category TO_DO/IN_PROGRESS/DONE.
- roleId dùng chung catalog nhưng global assignment khác project membership.
- version là số trong demo để mô phỏng cập nhật/comment conflict; không giả làm token đồng thời backend.

Fixture tối thiểu:
- Hai project: một đã có dữ liệu đầy đủ, một rỗng để duyệt empty state.
- Ba persona admin/PM/developer và ít nhất một user disabled.
- Sprint FUTURE/ACTIVE/CLOSED; ít nhất hai CLOSED có snapshot, một legacy chưa có snapshot.
- Issue đủ Story/Task/Bug, đủ priority, assignee null, parent null/child, text dài, description trống.
- Một status category DONE có tên tùy chỉnh để phát hiện code còn so bằng tên.
- Cột WIP=2 đã đầy; cột map nhiều status; issue chưa được map cột.
- Comment của mình/người khác/actor null legacy; attachment mẫu; notification đọc/chưa đọc/issue đã xóa.
- Audit đủ actor user và actor hệ thống null.
- Bảng issue ít nhất 25 row để duyệt pagination, không chỉ một trang ít dữ liệu.

Dùng nội dung mẫu tiếng Việt, không secret/tài khoản thật. Reset demo đưa state về seed và thu hồi mọi Object URL đã tạo. Refresh trang reset là hành vi mặc định đã chốt trong plan ngắn, không lén lưu toàn bộ state bằng localStorage.

ProjectId trên URL là nguồn quyết định scope trang. Parse số nguyên dương rồi kiểm tồn tại; dropdown selectedProjectId chỉ là lựa chọn điều hướng, không được làm trang /projects/2 render dữ liệu project 1. Trong các đợt UI trước khi có màn auth hoàn chỉnh, seed persona PM mẫu để mở trang duyệt trực tiếp; người duyệt có thể đổi persona qua công cụ demo. Không phụ thuộc cookie/token của trang thật.

### 6.2 Mẫu luồng cho mỗi action

1. Form/menu lấy ID từ route hoặc row được chọn, lấy dữ liệu nhập từ form.
2. Hàm validate kiểm đúng project/quan hệ, trường bắt buộc và role demo.
3. Không đạt: trả lỗi cụ thể, không dispatch thay state, giữ draft.
4. Đạt: tạo bản state mới trong một reducer/action; thêm audit/notification demo trong cùng transition nếu liên quan.
5. Selector render lại các trang liên quan; close dialog/toast chỉ sau action thành công.
6. Không có HTTP/callback từ server, không DB, không retry tự động. Giả lập delay/lỗi có thể bật qua demo scenario; chỉ dùng để duyệt trạng thái UI, không tạo bằng chứng tích hợp.

Actions nên trả kiểu phân biệt thành công/lỗi, ví dụ {ok:true,entityId} hoặc {ok:false,code,message,fieldErrors}. Tránh side effect trong React setState updater vì StrictMode có thể gọi lại; audit/notification cũng thuộc transition thuần, không push trực tiếp vào biến ngoài.

ID mới dùng counter nextId trong state, không dựa riêng Date.now hoặc độ dài array nên xóa rồi tạo lại không trùng. Khi status/points/membership của sprint ACTIVE đổi, action tạo event burndown demo nếu số liệu đổi. Snapshot CLOSED chỉ ghi lúc complete và không tính lại từ issue hiện tại. Đừng để việc render chart hoặc chuyển tab tự thêm audit/event.

## 7. Đặc tả luồng theo màn hình

### 7.1 Auth, profile và vai trò demo

Sign-in form: email, mật khẩu, toggle ẩn/hiện, link đăng ký. Chọn persona demo rõ ràng; không yêu cầu người dùng nhập mật khẩu thật. Sign-up: userName/fullName/email/password/confirm; email mẫu trùng và password mismatch báo tại field. submitDemoSignIn/submitDemoSignUp tạo session mẫu rồi tới projects; không ghi token/cookie thật.

Profile: userName/fullName; avatar dùng initials hoặc file preview cục bộ. Lưu cập nhật header/user menu ngay. Password form: current/new/confirm; mô phỏng validation và toast, không lưu mật khẩu rõ hoặc tạo kho mật khẩu demo.

Role switcher đổi userId của persona có sẵn, không đổi role của cùng user tùy tiện rồi làm lệch audit/inbox. Mỗi trang admin xét capability mẫu và có 403; không tự gán admin khi bị chặn. Các quy tắc bảo vệ last admin lấy từ account nghiệp vụ. [B05]

### 7.2 Project list và overview

Project list: title, search, view table/card, CTA “Tạo dự án”. Row có key/name/lead/member count và menu. CreateProjectDialog lấy name/key/description; key chỉ ASCII chữ/số theo mẫu thống nhất, trim, unique không phân biệt hoa/thường, tối đa 10; name 1..100. Đây là validation UI đề xuất để có UX rõ ràng, không tuyên bố BE hiện đã có đủ validation này.

createDemoProject tạo project + cấu hình demo khởi tạo có nguồn rõ; nếu chọn khởi tạo rỗng thì hiển thị setup checklist. updateDemoProject giữ ID/key ổn định, đổi name phản ánh sidebar/breadcrumb/list. deleteDemoProject có confirm và mô tả dữ liệu demo sẽ bỏ, không để orphan. Nếu xóa project đang mở thì về list. Lead lấy user mẫu tồn tại, không dùng chuỗi tên thay ID.

Overview: count tính từ state đúng project, sprint ACTIVE, recent activity, danh sách việc được giao, link tới backlog/board/members/reports. Project rỗng không có biểu đồ số liệu của project khác.

### 7.3 Backlog và sprint

Nguồn: project từ route; selectors lấy backlog + sprint FUTURE/ACTIVE, CLOSED qua mục lịch sử. Tái dùng BacklogView/actions contract hiện tại để tránh mất UI đã duyệt. [F04], [F09] Cách gom nhóm backlog/sprint tham khảo [J01]; quy tắc sản phẩm theo [B03], [B07].

- Product backlog: issue chưa DONE và không thuộc FUTURE/ACTIVE; link CLOSED là lịch sử.
- Create issue: title/type/priority; type phải được gán project, default chọn đúng cấu hình.
- Sprint form: name, goal, start/end; đủ hai ngày thì start < end.
- Add/remove: issue phải cùng project, không ở hai sprint mở; CLOSED không đổi membership.
- Reorder: nhận đủ ID của nhóm, unique và không làm mất issue. Khi filter đang bật, khóa drag/rank với giải thích; không gửi subset vào hàm full-order. [F11]
- Start: chỉ FUTURE, không có ACTIVE khác trong cùng project; cập nhật state và tạo snapshot commitment demo.
- Complete: chỉ ACTIVE; dialog thống kê DONE/unfinished, chọn trả product hoặc FUTURE cùng project. Validate đích trước update; lưu snapshot hoàn thành trước chuyển unfinished; nguồn giữ CLOSED và các link DONE.
- Edit/delete: FUTURE cho đổi ngày/xóa; ACTIVE chỉ name/goal; CLOSED xem lịch sử. Xóa nháp gỡ link, giữ issue.
- Nhóm có count/points, collapse, empty placeholder và CTA; lưu/hủy modal nhất quán.

### 7.4 Board, column và move

Board controls: board/sprint selector, filter user/type, search và mở cấu hình nếu role được phép. Mặc định chọn ACTIVE; không có ACTIVE thì chỉ dẫn về Backlog, có thể chọn CLOSED ở chế độ xem lịch sử.

Cột từ board.columns + columnStatuses; status hiện tại quyết định cột. Issue chưa mapping có nhóm “Chưa phân cột”, không bị ẩn mất. Board rank chỉ dùng nếu cột lưu trùng cột hiện tại. Đây là quy tắc hệ thống, không tự suy status ID từ enum cũ. [B02], [F14]

Card: type icon, key, title 2–3 dòng, priority, avatar, points; key/title mở panel. Kéo chỉ card được chọn; menu “Chuyển tới” và keyboard là phương án thay thế.

moveDemoCard({projectId,boardId,issueId,columnId,statusId,position,expectedVersion}):
1. Tra issue/board/column; sai quan hệ hoặc ID thì lỗi trước update.
2. Nếu nhiều status trong cột đích, chọn status trước khi commit.
3. Kiểm cạnh workflow cho thay status; kiểm WIP theo tất cả issue của project map vào cột, không chỉ card đang lọc trên màn.
4. Position là 0-based trong danh sách cột đầy đủ sau khi bỏ chính card; nếu filter làm không xác định vị trí thì khóa reorder.
5. Kiểm version demo, không đạt thì hiện “Dữ liệu mẫu đã thay đổi” + tải lại selector, không tự retry.
6. Một transition đổi issue.statusId/version và rank cột; board/list/detail cập nhật đồng thời, thêm activity demo.

WIP=0 không giới hạn; đầy hiển thị count đỏ/cảnh báo và move bị chặn theo quy tắc demo hệ thống. Jira có cách mô tả column/mapping riêng; chỉ tham khảo cấu trúc UI ở [J02], không copy quy tắc “cột ngoài cùng là Done” vì backend này dùng category DONE. [B02], [B04]

### 7.5 Issues table và detail panel

Table columns: key/title/type/status/priority/assignee/points/sprint/updated time/actions. Empty/filter-empty khác nhau; có “Xóa bộ lọc”. Page sizes 10/20/50, stable sort có ID tie-break, đổi filter reset page 1, page vượt tổng sau xóa được clamp.

Filter: keyword tìm key/title/description, statusId/typeId/assigneeId/unassigned/priority/sprint. Tất cả AND trong project, không lẫn dữ liệu project khác. Đây là mô phỏng cục bộ của search nghiệp vụ. [B08]

Panel mở từ Board/Backlog/Issues/Inbox dùng một component, lấy issueId từ URL. Header key/type/title + close/menu. Body chia mô tả, thông tin thuộc tính, comment/attachment/activity. Right panel rộng khoảng 520–640px desktop; mobile full-screen sheet; nếu cần đọc nhiều có nút mở trang chi tiết nhưng vẫn tái dùng nội dung.

Draft form tách khỏi state thật. Cancel khôi phục; chuyển issue hoặc close khi dirty có confirm. Validation points nguyên >=0, title không blank, assignee thuộc project hoặc null, parent cùng project/không phải chính mình/không tạo chu kỳ. Trường không được phép đổi phải read-only rõ ràng; không tạo input giả rồi âm thầm bỏ qua khi save.

Delete issue có expectedVersion demo và confirm key. Nếu còn child/attachment thì báo lý do, dẫn tới phần xử lý liên quan; không tự cascade cây khác. Đã xóa thì panel đóng, list/page/board/backlog/count cập nhật, notification link tới issue đã mất có thông báo phù hợp. [B08]

### 7.6 Comment và attachment

Comment editor plain text, submit disabled khi blank; hiển thị avatar/name/time/“đã chỉnh sửa”. Chủ comment hoặc role có EDIT_ISSUE mới thấy edit/delete; người mất VIEW_PROJECT không được vào panel. Dữ liệu legacy thiếu tác giả hiện “Người dùng không còn tồn tại”, không crash. expectedVersion demo bảo vệ stale form. Save thêm updatedAt/activity; sửa/xóa không gửi notification “bình luận mới” lần nữa. [B06]

Tệp mẫu: file picker nhiều tệp nếu được thiết kế, danh sách name/size/type, trạng thái “Tệp cục bộ của bản mẫu”, preview ảnh/text hoặc mở blob. Giới hạn demo đề xuất 10 MB/tệp, báo lỗi cụ thể khi quá; không gọi đây là giới hạn backend. Không thực thi HTML/SVG do file người dùng chọn. Object URL tạo sau chọn tệp, revoke khi xóa/reset/provider unmount; tải xuống chỉ nội dung mẫu đã có, không nút download giả.

### 7.7 Thành viên và cài đặt dự án

Members: search tên/email, role filter, table avatar/name/email/role/joinedAt/lead/actions. AddMemberDialog chọn user chưa thuộc project và project role; gán role hệ thống không đặt ở đây. Tối đa một PROJECT_MANAGER, không nhận SYSTEM_ADMIN làm role project; gỡ lead bị chặn với giải thích. Đổi role giữ assignedAt, không sửa global assignment. [B05]

Settings tabs:
- Thông tin: name/description, key read-only, vùng danger/delete.
- Issue types: catalog đã gán, add/remove/default; không gỡ default hoặc type đang dùng mà không xử lý quy tắc.
- Boards: danh sách/create/rename/delete, chọn board.
- Columns: hàng có tên/position/WIP/mapped status, drag handle, edit/delete dialog; WIP mới thấp hơn số hiện có báo lỗi trước khi đổi tên.
- Mapping: unassigned statuses, map/unmap bằng selector hoặc drag; một status không được ở hai cột cùng board.
- Workflow của project: hiển thị quy tắc đang áp dụng; thao tác chỉnh catalog toàn cục dẫn admin nếu có quyền, không làm người dùng tưởng đang sửa riêng project.

Xóa board mẫu xóa rank/mapping/columns đúng board, giữ issue/project. Xóa cột đang chứa issue bị chặn, hướng dẫn chuyển trước. [B07], [B02]

### 7.8 Notification

Bell có unread badge; popover hiển thị 5–8 thông báo gần nhất và link Inbox. Inbox có all/unread, search nếu cần, mark one/all, delete và empty state.

Filter theo session.userId ngay từ selector; chuyển persona thì count/inbox đổi. markAllRead chỉ chạm notification của persona đang chọn. Mở issue liên quan chuyển đúng project và issueId; đã xóa thì thông báo “Công việc không còn tồn tại”, không crash. Toast không được gắn thành thông báo vĩnh viễn trừ action có chủ đích. [B06]

### 7.9 Reports

Tabs Summary/Burndown/Velocity, chọn project/sprint, thống nhất points đơn vị. Tham khảo ý tưởng chart Jira ở [J03], [J04]; số liệu và lịch sử dùng quy tắc snapshot hệ thống. [B04]

- Summary: committed/current/completed/remaining, issue count, DONE/unfinished table.
- Burndown: trục X thời gian, Y remaining points; step chart từ event mẫu, tooltip có ngày/remaining/total; legend đọc được. Không đổi các ngày trước khi có dữ liệu thành 0.
- Velocity: cặp committed/completed theo CLOSED sprint; label/tooltip; không tính từ point hiện tại của issue đã sửa sau CLOSED.
- Legacy: baselineAvailable=false/completion unavailable thì hiện giải thích, không vẽ 0 giả hoặc đường lịch sử bịa.
- Sau completeDemoSprint tạo snapshot một lần; các chỉnh sửa issue về sau không thay completed snapshot. Current summary có thể đổi, cần nhãn phân biệt.

Có thể dùng SVG + React cho chart vừa phải để chưa thêm thư viện; phải có bảng số liệu thay thế và tooltip dùng được bằng bàn phím. Không dùng ảnh chart tĩnh để thay tính năng tương tác.

### 7.10 Admin

Admin nav riêng: Overview, Users, Roles & permissions, Issue types, Statuses, Workflows, Audit.

Users: search/filter enabled, detail drawer, toggle enabled có confirm, role multiselect, last enabled admin guard. Role catalog có SYSTEM_ADMIN reserved không đổi tên/xóa; phân biệt role toàn cục và role project. Matrix permissions cho từng role có check/dirty/save/cancel; cập nhật capability của persona tương ứng ở lần render tiếp theo. [B05]

Type/status: table có CRUD, color/category, cảnh báo đang được dùng; delete có confirm. Workflow: chọn from/to từ catalog, table cạnh chuyển, không trùng edge; có preview đơn giản các trạng thái và hướng chuyển. Không cần kéo vẽ graph tự do trong đợt này.

Audit: filters entityType/entityId/actor/action/from/to, stable sort/page, detail đọc được; actor null “Hệ thống”; không cho nhập role/type ID bằng text khi có selector. Overview tính số đếm từ DemoState. [B06]

## 8. Vai trò và trạng thái UI cần duyệt

Đề xuất persona/capability mẫu, không phải enforcement BE:
- Admin: cấu hình toàn cục, users/roles/audit, mọi project.
- PM/lead: project settings/member/board/sprint/issue của project; không khu admin.
- Developer: project được tham gia, issue/comment theo quyền mẫu; các action bị hạn chế có giải thích.
- Disabled/anonymous/outsider scenario: màn lỗi hoặc hướng dẫn đăng nhập demo phù hợp.

Global roles và member roles phải là quan hệ riêng trong fixture. Không hardcode userId=1 thành admin. Mỗi action vẫn kiểm capability trong reducer, không chỉ ẩn nút. Chọn role demo là công cụ duyệt UI, có nhãn rõ và không ghi token thật.

Scenario control phát triển: normal/loading/empty/error/forbidden/not-found và reset demo; trạng thái không được ghi đè lên dữ liệu thật. Loading skeleton giữ kích thước; error có Retry; form error giữ draft; empty có CTA đúng trang; 403 không có nút lưu; missing history có giải thích.

## 9. Thứ tự triển khai và tiêu chí chốt từng đợt

| Đợt | File/luồng chính | Nghiệm thu trước commit |
|---|---|---|
| 1 | types/fixtures/actions/selectors/provider + shell/routes/project list/overview | Mở không BE, đổi project giữ đúng scope, tạo project rỗng, nav không 404, auth layout không sidebar |
| 2 | adapter/backlog/sprint/board/issues/panel | Một issue đổi ở board phản ánh ở list/detail; CLOSED giữ lịch sử; filtered reorder không mất issue |
| 3 | comment/attachment/member/settings | CRUD state chạy thật; last PM/lead/WIP/mapping lỗi rõ; object URL cleanup |
| 4 | inbox/reports/snapshots | Unread theo persona; report current vs snapshot đúng; legacy không vẽ số giả |
| 5 | auth/profile/admin | Persona đúng quyền UI; last admin guard; role matrix/audit/filter/page |
| 6 | responsive/states/a11y/checklist/screenshots | Bộ đường dẫn chạy được, build/typecheck/tests đạt, hình mới theo đúng commit |

Mỗi đợt:
1. Đọc lại git diff và source liên quan, trình plan cụ thể nếu chưa được người dùng chốt.
2. Code trong FE, comment tiếng Việt cho transition/validation chính.
3. Tự kiểm tra caller/state/relationship và thử hành vi liên quan.
4. Chạy kiểm tra phù hợp, sửa lỗi thật rồi retest; không tạo test chỉ lặp cú pháp.
5. Commit riêng file đã kiểm, không stage thay đổi ngoài scope; không dùng sub-agent.
6. Cập nhật docs/UI_DELIVERY.md: commit, route, hành vi, kết quả lệnh, giới hạn và link ảnh mới.

## 10. Checklist kiểm tra và cách chạy

Từ repo FE:
~~~powershell
node --version
npm --version
git status --short
node node_modules/typescript/bin/tsc --noEmit --incremental false
npm run test:planning
npm run build
npm run dev -- --hostname 127.0.0.1 --port 3100
~~~
Nếu node_modules đã có thì dùng trước, không tự thay lockfile. Nếu thiếu dependency thì cài theo package-lock trong plan được duyệt. Mở http://127.0.0.1:3100/ui-review/backlog; không dùng next start để duyệt route development vì guard production. [F08]

Baseline lượt khảo sát trước bàn giao:
- Node 24.19.0, npm 11.17.0 trên máy này.
- Typecheck đạt; 6 test planning hiện có đạt. Chúng chỉ kiểm mapper/reorder/move cũ, chưa kiểm tất cả UI mới. [F19]
- Production build đạt; log ở C:/Users/Admin/Documents/Codex/2026-08-27/https-github-com-ngothithanhh-jira-https/outputs/fe-audit-build.log.
- npm run lint độc lập mở bước cấu hình ESLint và exit 1, chưa có lượt lint độc lập đạt. Không diễn giải build pass thành lint pass.
- Chưa có visual/browser QA mới cho bộ trang đầy đủ. Không suy ra công cụ browser vẫn tắt chỉ vì tài liệu cũ ghi vậy; kiểm khả năng tool ở phiên agent mới.

Model tests cần bổ sung khi có implementation:
- Cùng issue một nguồn, selector không nhân đôi; project scoping.
- Start/complete/delete sprint; category DONE tên tùy chỉnh.
- Move đúng board/mapping/WIP; invalid action giữ nguyên input state.
- Reorder scope đầy đủ và filter lock.
- Parent cycle, comment owner/version, attachment cleanup helper.
- Last PM/admin, inbox recipient, report snapshot bất biến.

UI/browser khi công cụ khả dụng:
- Desktop 1440×900; laptop 1280×800; tablet 768×1024; mobile 390×844.
- Điều hướng sidebar/menu, reload/deep link và back/forward.
- Modal focus/Esc/dirty cancel, keyboard move, overflow board/table và header không che nội dung.
- Chọn issue từ 4 nơi mở cùng panel; close giữ filter/sprint/page.
- Network tab của các route demo không có request nghiệp vụ tới BE; tải asset/font không tính là nghiệp vụ.
- Có ảnh desktop/mobile mới, gắn route và commit; ảnh cũ chỉ là nguồn tham khảo.

Test end-to-end demo tối thiểu:
1. Chọn PM mẫu → tạo project hoặc mở project SCR.
2. Tạo issue → thêm sprint FUTURE → start.
3. Sang Board → move issue → mở detail → sửa description/points.
4. Thêm comment/tệp mẫu → sang Issues kiểm cùng nội dung.
5. Complete sprint → Reports xem snapshot.
6. Chuyển persona → Inbox đúng người nhận; Admin xem log/role nếu được phép.
7. Reset → dữ liệu trở về seed, không còn tệp/object URL tạm.

## 11. Ranh giới với lần nối backend sau

UI có view-model/actions rõ để sau này thay demo actions bằng adapter, nhưng hiện chỉ dùng state mẫu:
- Không import BacklogConnected, apiClient, useLogin/useGetTasks/useBulkUpdateTasks hoặc các hook API thật vào demo. [F12], [F13], [F14]
- Không sửa BE/CORS/DTO/quyền ở đợt UI. Những thiếu sót hợp đồng API để ghi vào mục “đợi tích hợp” của UI_DELIVERY.md.
- Chưa làm token refresh/cookie/BFF trong bước này.
- Không coi upload preview là Cloudinary, đổi persona là login thật, hoặc read-all mẫu là cập nhật notification DB.
- Trong production, giữ guard của review. Khi người dùng yêu cầu bản demo deployable, trình riêng cơ chế bật demo rõ ràng.

## 12. Nguồn tra cứu

### Nguồn FE

- [F01] package.json: dependency đã cài; không phải đề nghị phiên bản mới.
- [F02] UI_REVIEW_02.md: phong cách đã chỉnh và giới hạn của ảnh/QA cũ.
- [F03] PlanningShell: shell, nav, mobile drawer.
- [F04] BacklogView: màn chuẩn và hành vi hiện có.
- [F05] planning-parts: avatar/status/type/detail dùng chung; cần cải tiến category.
- [F06] ReviewProvider: state/actions hiện tại, complete bỏ sprint, shell đang bọc cứng.
- [F07] BacklogPreview: adapter hiện có.
- [F08] ReviewLayout: production guard.
- [F09] types.ts: data/actions contract cũ.
- [F10] fixtures.ts: dữ liệu mẫu ban đầu.
- [F11] model.ts: helper mới/cũ của review.
- [F12] BacklogConnected: nhận diện cây API thật cần tránh gọi.
- [F13] api-client: token/interceptor thật.
- [F14] bulk task updates: status ID hardcode; không reuse cho board demo.
- [F15], [F16], [F17], [F18]: mock/legacy models không dùng làm state chuẩn mới.
- [F19] planning-model.test.mjs: 6 test cũ.
- [F20] THIRD_PARTY_NOTICES: nguồn tham khảo và license.
- [F21] UI_REVIEW_03_PLAN: công việc preview đang dở.
- [F22] primitive dialog Radix.
- [F23], [F24] ảnh desktop/mobile cũ, không đại diện mọi thay đổi chưa commit.

### Nguồn nghiệp vụ cục bộ

- [B01] phạm vi 19 UC và các giới hạn backend.
- [B02] card/move/WIP/mapping/version.
- [B03] product/sprint backlog và full-order.
- [B04] snapshot, current/history, burndown/velocity.
- [B05] profile/global role/member role/last admin.
- [B06] comment ownership/version, inbox/audit.
- [B07] vòng đời sprint/board/column.
- [B08] chi tiết/tìm/xóa issue.

### Tham khảo chính thức bên ngoài

- [J01] Atlassian, Use your scrum backlog: tham khảo nhóm sprint/backlog và việc lập kế hoạch.
- [J02] Atlassian, Configure columns: tham khảo bố cục cột/mapping và hiển thị ràng buộc.
- [J03] Atlassian, View and understand the burndown chart: tham khảo biểu diễn remaining work theo thời gian.
- [J04] Atlassian, View and understand the velocity chart: tham khảo cách so commitment/completion giữa sprint.

Các trang bên ngoài được kiểm ngày 12/11/2026. Chỉ dùng tham khảo; các lựa chọn cụ thể trong mục 4–10 là đề xuất cho repo này, không phải bản chép quy định Jira.

[F01]: <C:/Users/Admin/Documents/Codex/2026-08-27/https-github-com-ngothithanhh-jira-https/work/jira_fe/package.json:85>
[F02]: <C:/Users/Admin/Documents/Codex/2026-08-27/https-github-com-ngothithanhh-jira-https/work/jira_fe/docs/UI_REVIEW_02.md:5>
[F03]: <C:/Users/Admin/Documents/Codex/2026-08-27/https-github-com-ngothithanhh-jira-https/work/jira_fe/src/features/backlog/components/planning-shell.tsx:18>
[F04]: <C:/Users/Admin/Documents/Codex/2026-08-27/https-github-com-ngothithanhh-jira-https/work/jira_fe/src/features/backlog/components/backlog-view.tsx:54>
[F05]: <C:/Users/Admin/Documents/Codex/2026-08-27/https-github-com-ngothithanhh-jira-https/work/jira_fe/src/features/backlog/components/planning-parts.tsx:16>
[F06]: <C:/Users/Admin/Documents/Codex/2026-08-27/https-github-com-ngothithanhh-jira-https/work/jira_fe/src/features/backlog/components/review-provider.tsx:18>
[F07]: <C:/Users/Admin/Documents/Codex/2026-08-27/https-github-com-ngothithanhh-jira-https/work/jira_fe/src/features/backlog/components/backlog-preview.tsx:7>
[F08]: <C:/Users/Admin/Documents/Codex/2026-08-27/https-github-com-ngothithanhh-jira-https/work/jira_fe/app/ui-review/layout.tsx:6>
[F09]: <C:/Users/Admin/Documents/Codex/2026-08-27/https-github-com-ngothithanhh-jira-https/work/jira_fe/src/features/backlog/types.ts:1>
[F10]: <C:/Users/Admin/Documents/Codex/2026-08-27/https-github-com-ngothithanhh-jira-https/work/jira_fe/src/features/backlog/fixtures.ts:29>
[F11]: <C:/Users/Admin/Documents/Codex/2026-08-27/https-github-com-ngothithanhh-jira-https/work/jira_fe/src/features/backlog/model.ts:4>
[F12]: <C:/Users/Admin/Documents/Codex/2026-08-27/https-github-com-ngothithanhh-jira-https/work/jira_fe/src/features/backlog/components/backlog-connected.tsx:25>
[F13]: <C:/Users/Admin/Documents/Codex/2026-08-27/https-github-com-ngothithanhh-jira-https/work/jira_fe/src/lib/api-client.ts:5>
[F14]: <C:/Users/Admin/Documents/Codex/2026-08-27/https-github-com-ngothithanhh-jira-https/work/jira_fe/src/features/tasks/api/use-bulk-update-tasks.ts:7>
[F15]: <C:/Users/Admin/Documents/Codex/2026-08-27/https-github-com-ngothithanhh-jira-https/work/jira_fe/src/features/tasks/api/use-get-task.ts:7>
[F16]: <C:/Users/Admin/Documents/Codex/2026-08-27/https-github-com-ngothithanhh-jira-https/work/jira_fe/src/features/tasks/api/use-delete-task.ts:8>
[F17]: <C:/Users/Admin/Documents/Codex/2026-08-27/https-github-com-ngothithanhh-jira-https/work/jira_fe/src/features/projects/api/use-update-project.ts:8>
[F18]: <C:/Users/Admin/Documents/Codex/2026-08-27/https-github-com-ngothithanhh-jira-https/work/jira_fe/src/features/members/types.ts:1>
[F19]: <C:/Users/Admin/Documents/Codex/2026-08-27/https-github-com-ngothithanhh-jira-https/work/jira_fe/tests/planning-model.test.mjs:6>
[F20]: <C:/Users/Admin/Documents/Codex/2026-08-27/https-github-com-ngothithanhh-jira-https/work/jira_fe/THIRD_PARTY_NOTICES.md:1>
[F21]: <C:/Users/Admin/Documents/Codex/2026-08-27/https-github-com-ngothithanhh-jira-https/work/jira_fe/docs/UI_REVIEW_03_PLAN.md:3>
[F22]: <C:/Users/Admin/Documents/Codex/2026-08-27/https-github-com-ngothithanhh-jira-https/work/jira_fe/src/components/ui/dialog.tsx:1>
[F23]: <C:/Users/Admin/Documents/Codex/2026-08-27/https-github-com-ngothithanhh-jira-https/outputs/fe-review/backlog-desktop.jpg>
[F24]: <C:/Users/Admin/Documents/Codex/2026-08-27/https-github-com-ngothithanhh-jira-https/outputs/fe-review/backlog-mobile.jpg>
[B01]: <C:/Users/Admin/Documents/Codex/2026-08-27/https-github-com-ngothithanhh-jira-https/work/jira/docs/FEATURE_STATUS.md:5>
[B02]: <C:/Users/Admin/Documents/Codex/2026-08-27/https-github-com-ngothithanhh-jira-https/work/jira/docs/BOARD_CARDS_API.md:1>
[B03]: <C:/Users/Admin/Documents/Codex/2026-08-27/https-github-com-ngothithanhh-jira-https/work/jira/docs/BACKLOG_API.md:1>
[B04]: <C:/Users/Admin/Documents/Codex/2026-08-27/https-github-com-ngothithanhh-jira-https/work/jira/docs/SCRUM_REPORT_API.md:1>
[B05]: <C:/Users/Admin/Documents/Codex/2026-08-27/https-github-com-ngothithanhh-jira-https/work/jira/docs/ACCOUNT_MANAGEMENT_API.md:1>
[B06]: <C:/Users/Admin/Documents/Codex/2026-08-27/https-github-com-ngothithanhh-jira-https/work/jira/docs/COLLABORATION_ADMIN_API.md:1>
[B07]: <C:/Users/Admin/Documents/Codex/2026-08-27/https-github-com-ngothithanhh-jira-https/work/jira/docs/CONTAINER_MANAGEMENT_API.md:1>
[B08]: <C:/Users/Admin/Documents/Codex/2026-08-27/https-github-com-ngothithanhh-jira-https/work/jira/docs/ISSUE_QUERY_API.md:1>
[J01]: <https://support.atlassian.com/jira-software-cloud/docs/use-your-scrum-backlog/>
[J02]: <https://support.atlassian.com/jira-software-cloud/docs/configure-columns/>
[J03]: <https://support.atlassian.com/jira-software-cloud/docs/view-and-understand-the-burndown-chart/>
[J04]: <https://support.atlassian.com/jira-software-cloud/docs/view-and-understand-the-velocity-chart/>
