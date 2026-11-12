# Plan nối Scrum board — người dùng đã chốt

## Hiện trạng và phạm vi

- Nền FE `feat/backlog-ui-review` tại `e2ec2c6`, BE `feat/backend-integration` tại `d28dbec`; đã fetch, hai working tree sạch trước khi viết plan. Không ghép nhánh notifications/reports hoặc sửa phần members/account của máy kia.
- UI mẫu: `src/features/ui-demo/screens/board-screen.tsx`. API thật: BE `BoardController`, `BoardCardController`, `ContainerManagementController`. Phần này giữ bố cục card/cột/filter/dialog, dùng connected session và IssuePanel thật.
- Đọc DB demo xác nhận SHOP hiện có 1 sprint FUTURE và chưa có board. Không được hiển thị cột/card fixture như thể cấu hình đã tồn tại.
- Phần triển khai gồm chọn/tạo/đổi tên/xóa Scrum board; thêm/sửa/xóa cột, tên/WIP và map/unmap status; xem sprint ACTIVE/CLOSED; kéo/reorder card, menu chuyển cột/status, tìm/lọc, mở detail và xử lý xung đột. Thứ tự cột dùng position hiện có; kéo thay thứ tự cột là phần cấu hình tiếp theo nếu cần, không trộn với reorder card.
- Không thay schema. Backend bổ sung guard sprint tùy chọn cho move để giao diện Scrum không ghi vào sprint vừa đóng/issue vừa rời sprint; client API cũ không truyền sprintId giữ hợp đồng hiện tại.

## 1. Vào board và đọc dữ liệu

1. Route mới `/app/projects/{projectId}/board` và ProjectNavigation. `projectId` là `projects.project_id`, kiểm nguyên dương bằng `projectIdFromRoute`; ProjectGate đọc context/quyền đúng project trước khi dựng board. 401/403/404 dừng đúng state; lỗi mạng giữ bản nháp đang mở nếu đã có data, khóa thao tác ghi và cho thử lại.
2. `useConnectedBoards(projectId)` gọi GET `boards/project/{projectId}` và `sprints/project/{projectId}`. BoardId là `boards.board_id`, sprintId là `sprints.sprint_id`; kiểm projectId trong mọi DTO khớp URL. Chỉ đưa board loại SCRUM vào màn này. ID được chọn từ URL/selector phải thuộc kết quả đã được kiểm quyền, sai ID báo thiếu/không thuộc project, không tự đổi sang một ID khác.
3. Lần đầu không có lựa chọn thì mặc định board SCRUM đầu tiên, sprint ACTIVE nếu có. Selector cho xem CLOSED; FUTURE dẫn người dùng về Backlog để bắt đầu. Không có ACTIVE hiện hướng dẫn mở Backlog, không tự start sprint chỉ vì xem board. CLOSED chỉ đọc và ghi rõ đây là trạng thái hiện tại của các issue còn trong lịch sử, không phải snapshot trạng thái lúc đóng.
4. `useConnectedBoardCards(projectId, boardId, sprintId)` đọc GET `boards/{boardId}/issues`, GET `sprints/{sprintId}/issues` và reference status/type/member đã có. GET card trả cả project; FE lấy giao tập issueId thuộc sprint đang chọn để hiển thị. Cột lấy `columnId` từ response đã suy theo status, không suy từ nhãn tiếng Việt hoặc vị trí trên màn hình.
5. Cache key chỉ chứa actor/project/board/sprint, không chứa toàn object reference. Reference thay đổi invalidate cùng key; đọc reference mới nhất trong query xử lý response, tránh đổi key làm mất form/panel. Abort khi đổi project/phiên; không fallback DemoProvider.
6. `buildBoardView` thuần dữ liệu: giữ nguyên ID/version/null, sort cột theo position rồi ID; card theo position rồi issueId. Issue status chưa map giữ ở nhóm Chưa phân cột, không bị bỏ mất. Đếm card sprint riêng với WIP load: WIP tính toàn bộ card project trong cột, kể cả ngoài sprint đang xem. WIP=0 nghĩa không giới hạn.

Đọc các bảng `boards`, `board_columns`, `board_column_statuses`, `issues`, `board_issues`, `sprints`, `sprint_issues`, cùng reference thông qua service cũ; GET không ghi DB.

## 2. Chọn vị trí, trạng thái và gửi move

1. `requestBoardMove` nhận card/version từ lần đọc hiện tại và cột/vị trí đích từ DnD hoặc menu. Chỉ EDIT_ISSUE của project, sprint ACTIVE, data đọc thành công và không có write pending mới cho gửi. Khóa kéo khi lọc để các index nhìn thấy không bị nhầm với cả cột. Menu Chuyển tới vẫn dùng được khi lọc vì đặt vào cuối phạm vi sprint bằng tập card không lọc.
2. `toGlobalBoardPosition` quy đổi index sprint sang vị trí cột toàn project mà API yêu cầu. Loại chính issue đang kéo khỏi hai tập. Nếu có card sprint đứng sau điểm thả, chèn trước card đó trong cột toàn project; nếu thả cuối, chèn sau card sprint cuối cùng; nếu cột chưa có card sprint thì chèn cuối cột project. Không làm đổi thứ tự tương đối các card bị ẩn ngoài sprint. Gửi chỉ số 0-based sau khi loại chính card đang kéo, không gửi trực tiếp destination.index.
3. `allowedBoardTargets` đọc workflow allowed-transitions theo statusId nguồn và giao với mappedStatusIds của cột đích. Giữ status nếu reorder trong cột hiện tại; một lựa chọn hợp lệ thì dùng; nhiều lựa chọn mở dialog; không có lựa chọn báo workflow không cho chuyển và không gọi PUT. Không tự chọn status đầu tiên chỉ vì tên cột có vẻ phù hợp.
4. Dialog giữ snapshot `{projectId, boardId, sprintId, issueId, expectedVersion, targetColumnId, targetStatusId, position}` của lần kéo. Đổi board/sprint hoặc reference làm mục tiêu không còn hợp lệ thì hủy lựa chọn cũ. Không lấy version mới từ cache rồi tự retry một quyết định được đưa ra trên bản cũ.
5. `useBoardMutation` dùng lại `connectedMutation`/khóa phiên liên tab, capture scope có cả board/sprint/generation. Trước dispatch kiểm actor cookie; BFF kiểm Origin và whitelist, không nhận actor/token từ body browser. Gửi một PUT `boards/{boardId}/issues/{issueId}/move` gồm `{columnId,statusId,position,expectedVersion,sprintId}`. Chặn bấm đôi; không tự retry khi timeout/401/409.

## 3. Guard backend và cập nhật trong transaction

1. Thêm `sprintId` nullable, `@Positive` vào `MoveBoardIssueRequest`; thêm SprintRepository và SprintIssueRepository vào `BoardCardService`. Không nhận project/actor từ request để xác định quyền. Client cũ bỏ sprintId vẫn theo luồng board toàn project hiện có.
2. Trong `BoardCardService.move`, giữ kiểm EDIT_ISSUE theo project của board và issue cùng project; lấy khóa `projects` hiện có, refresh issue và kiểm expectedVersion. Sai version trả409 trước ghi.
3. Nếu có sprintId, `validateSprintMoveScope` đọc sprints sau khi đã giữ khóa project: không tồn tại404; sprint khác project400; không ACTIVE409; không có cặp `(sprintId,issueId)` trong sprint_issues409. Các trường hợp này dừng trước thay status/rank/lịch sử. Không tự thêm issue trở lại sprint hoặc tự mở lại sprint.
4. Sprint completion/remove hiện giữ cùng khóa project. Nếu completion/remove commit trước, move đọc lại state/link mới và dừng409. Nếu move lấy khóa trước, move commit rồi completion/remove xử lý tiếp trên dữ liệu mới. Không tạo khóa thứ hai hoặc retry vòng lặp.
5. Giữ luồng cũ: kiểm cột thuộc board, status có mapping, position hợp lệ; `IssueService.changeIssueStatus` kiểm workflow/WIP và ghi `issues.status_id/updated_at/version`, lịch sử chuyển trạng thái, notifications và metrics theo transaction hiện tại. Reorder cùng status không thêm lịch sử đổi status, nhưng vẫn cập nhật timestamp/version của issue đang kéo.
6. `board_issues` lưu/chuẩn hóa column_id và position cột đích trong cùng transaction. Lỗi bất kỳ bước nào rollback status/rank/lịch sử. Hai move cùng issue/version: lượt đầu thành công và tăng version, lượt sau409. Hai issue tranh WIP=1 đếm lại dưới khóa nên chỉ một lượt vào; số badge FE chỉ hỗ trợ hiển thị, backend là bên quyết định.

## 4. Nhận kết quả, lỗi và đồng bộ màn khác

1. Nhận BoardCardResponse đã commit, cập nhật version/snapshot đã xác nhận; invalidate board cards/detail/catalog, issue/detail/search, planning, project statistics và các board cùng project dưới actor hiện tại. Sửa issue từ IssuePanel hoặc thay sprint từ Backlog cũng invalidate domain board để không giữ card cũ khi quay lại.
2. Chờ refetch rồi dùng `completeConnectedMutation`; đọc cache mới nhất bên trong callback sau khóa/auth, không đóng dialog hoặc toast từ response tài khoản/board/sprint trước. Giữ form nếu lỗi refetch, khóa ghi nhưng Hủy/X vẫn dùng được khi không có mutation pending.
3. 409 tải lại card/config/sprint; báo có thể do version, WIP hoặc sprint/link đã đổi, không tự replay. 400/403/404 hiển thị lỗi đúng phạm vi; lỗi mạng không giả move thành công. Không lạc quan chuyển card rồi bỏ rollback.
4. Version của card đang kéo bảo vệ chính issue đó; không tuyên bố có revision của toàn board hoặc chống mọi lượt reorder hai card khác nhau. Không triển khai websocket/polling nền; cập nhật khi thao tác, focus và nút Tải lại như các màn connected đang có.

## 5. Cấu hình board/cột tối thiểu để dùng được board mới

1. MANAGE_BOARD mở tạo/đổi tên/xóa board; form tên tối đa100, boardType=SCRUM, projectId từ route đã qua gate. POST boards dùng transaction cũ ghi boards + ba cột mặc định. Ba cột ban đầu chưa có mapping: UI phải hiện trạng thái này và cho cấu hình, không tuyên bố đã tự map.
2. `BoardConfiguration` dùng form/modal hiện có để thêm cột (boardId thật, tên, position cuối), sửa tên/WIP bằng PATCH boards/columns/{columnId}; WIP nguyên>=0. Backend kiểm cột→board→project, khóa project và chặn giảm WIP thấp hơn tải hiện tại trước ghi board_columns.
3. Map POST boards/columns/map-status với columnId/statusId; unmap DELETE cùng route/query. Hiển thị status đang map vào cột nào, chặn chọn trùng ngay UI; backend kiểm một status chỉ có một cột trong cùng board. Từng nút là một request độc lập đã lưu, không ghép gỡ/thêm thành transaction giả. Gỡ mapping có cảnh báo card liên quan sẽ vào Chưa phân cột; không xóa issue/status gốc.
4. Xóa cột cần xác nhận; backend409 nếu còn issue theo mapping, giữ cấu hình và cho chuyển issue trước. Xóa board cần gõ đúng tên: backend xóa cấu hình/rank của board, giữ issues/project; không cascade xóa dữ liệu sản phẩm. Nếu board đang chọn biến mất, reset selector chỉ sau kết quả đã xác nhận và kiểm scope.
5. Payload BFF chỉ nhận trường contract nêu trên; mọi ID giới hạn Java int, version nguyên an toàn>=0, body có giới hạn. Chỉ mở GET/POST/PATCH/DELETE/PUT đúng danh sách cần dùng, không proxy rộng. Cấu hình lưu bằng API thật; không thêm endpoint tạo status/workflow hoặc tự cấp quyền.

## 6. Điểm thêm/sửa

- FE `features/connected/board/{contract,model,queries,screen,configuration}.ts(x)`; component card/cột/dialog lấy bố cục mẫu thành view nhận props, dùng lại kit/IssuePanel. Route board, ProjectNavigation và allowlist `server.ts`.
- `connected/issues/queries.ts` bổ sung invalidate domain board sau issue/sprint mutation; không thay auth/client/session hoặc làm mất các guard issue/backlog vừa kiểm.
- BE DTO MoveBoardIssueRequest, BoardCardService guard sprint và test liên quan; không thay nghiệp vụ cấp quyền hay schema. Nếu phát hiện cần thay đổi lớn ngoài phạm vi này, trình bày phần chênh lệch trước khi code.
- Comment tiếng Việt ở hàm chính/khối mới nêu nguồn ID, điều kiện dừng, đọc/ghi và thứ tự khóa/transaction.

## 7. Tự test và bàn giao

1. FE unit: DTO/null/category, giao tập sprint, unmapped, WIP toàn project, query/body/Origin/Bearer, quy đổi position có card ẩn ngoài sprint, dialog nhiều status, stale version và scope đổi phiên/board/sprint.
2. BE regression: BoardCardRegressionTest và ScrumRegressionTest; thêm sprintId không tồn tại/khác project/FUTURE/CLOSED/link mất, legacy không truyền vẫn dùng được; kiểm guard xảy ra trước ghi status/rank.
3. PostgreSQL integration trên DB test riêng: hai request cùng version, hai card tranh WIP; move tranh với complete/remove sprint, rollback khi bước sau lỗi. Chỉ báo chạy đồng thời sau khi đã quan sát kết quả transaction thật, không coi Mockito hoặc browser tuần tự là bằng chứng concurrency DB.
4. Browser production/DB demo: tạo board→map cột→start sprint từ Backlog→card xuất hiện→kéo trong/cross cột→menu→multi-status→detail→F5; filter/keyboard/mobile; chưa map/no board/no active/CLOSED; WIP409 và version409 giữ dữ liệu, lỗi refetch giữ draft và Cancel dùng được; đổi tài khoản/board/sprint khi request chậm; developer/outsider và ID khác project không vượt quyền.
5. Hồi quy auth/project/issue/backlog, TypeScript, build; chỉ mở rộng/retest khi sửa lỗi liên quan. Một reviewer chỉ đọc phần phức tạp theo AGENTS, sửa finding thật trong plan và kiểm lại; không dùng agent viết code.
6. Seed board/mapping/card bằng API vào `jira_demo_ready`, không reset dữ liệu cá nhân. Chuẩn bị sprint demo ACTIVE có card để kiểm ngay; dữ liệu test tách tiền tố và được dọn. Không ghi credentials vào repo/log/ảnh.
7. Commit/push FE và BE riêng; ghi docs delta cho máy kia về shared BFF/cache, không merge master. Bàn giao URL/tài khoản/luồng kiểm/kết quả và giới hạn, dừng chờ người dùng kiểm trước phần tiếp theo.

## Điểm cần người dùng chốt

Người dùng đã chốt: “Chốt plan này, triển khai đi nhé, xong tự test, commit/push rồi báo mình luồng kiểm tra như phần trước.” Triển khai phạm vi trên, gồm guard sprint tương thích ngược và cấu hình board/cột; kết quả thực tế được ghi riêng trong CONNECTED_SCRUM_BOARD.md.
