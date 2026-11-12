# Scrum board đã nối API thật

## Mở kiểm tra

- FE production: http://127.0.0.1:3130/app/projects/1/board
- Backend: cổng8080, PostgreSQL `jira_demo_ready`, Hibernate validate. Không đổi schema/migration hoặc DB cá nhân.
- PM `pm.demo@example.test`; developer `dev.demo@example.test`; admin `admin.demo@example.test`; outsider `outsider.demo@example.test`.
- Mật khẩu ở file local ngoài Git `outputs/backend-integration/credentials.local.json` của workspace cha. Không chép credential vào Git/log/ảnh.
- Board demo **SHOP — Phát triển sản phẩm**, 3 cột Cần làm / Đang thực hiện / Hoàn thành; sprint demo hiện ACTIVE với 4 card (2 TO_DO, 1 IN_PROGRESS, 1 DONE). SHOP có tổng 9 issue; board chỉ hiện 4 issue thuộc sprint. WIP cột Đang thực hiện =4, tính trên toàn project. Cột này map cả Đang thực hiện và Đang kiểm thử để kiểm dialog chọn trạng thái.

## Luồng người dùng kiểm tra

1. Đăng nhập PM → Dự án → Website thương mại điện tử → **Scrum board**. Mặc định chọn board đầu và sprint ACTIVE. Chọn board/sprint khác qua hai selector. URL có boardId/sprintId sai báo lỗi, không tự đổi sang dữ liệu khác.
2. Giữ phần nền card để kéo. Kéo lên/xuống trong cùng cột chỉ đổi thứ tự, giữ trạng thái; thả sang cột khác đổi trạng thái sau khi backend xác nhận. Cột có nhiều trạng thái hợp lệ mở dialog chọn. F5 kiểm lại thứ tự và vị trí. Bàn phím: focus card bằng Tab → Space → phím mũi tên → Space.
3. Menu **⋯ → Chuyển tới…** chọn cột/trạng thái, đặt card ở cuối phạm vi sprint trong cột đích. Trạng thái không có bước chuyển workflow bị disable. Bấm tên hoặc mã card mở IssuePanel thật để sửa/phân công; lưu xong board được tải lại.
4. Tìm mã/tên, lọc người phụ trách hoặc loại. Khi lọc, kéo bị tắt để không gửi index của danh sách con; menu chuyển vẫn dùng được. Badge WIP là tải cả project, có thể lớn hơn số card sprint đang thấy.
5. Mở **Cấu hình board**: đổi tên, sửa tên/WIP cột (0=không giới hạn), thêm/xóa cột, map/unmap trạng thái. Mỗi nút lưu một request riêng. Một trạng thái chỉ map vào một cột trong cùng board. Gỡ map có xác nhận và card liên quan xuất hiện ở Chưa phân cột; không xóa issue hay trạng thái gốc.
6. Có thể tạo board mới với 3 cột mặc định. Board mới chưa map status: mở cấu hình và map để card vào cột. Xóa cột còn issue hoặc giảm WIP dưới tải hiện tại bị từ chối409. Xóa board cần gõ đúng tên; chỉ xóa cấu hình/rank board, giữ issue/sprint/project.
7. Kiểm xung đột: hai phiên độc lập cùng đọc một card, phiên thứ nhất kéo, phiên thứ hai kéo từ version cũ →409 rồi tải lại; thao tác cũ không tự gửi lại. Cột đầy WIP hoặc sprint vừa đóng/gỡ issue cũng từ chối, dữ liệu đã lưu vẫn giữ.
8. Hoàn tất sprint từ Backlog rồi chọn sprint đã đóng trên board. Chỉ xem các issue còn trong lịch sử; trạng thái hiển thị là hiện tại, không phải snapshot lúc đóng. Kéo/menu và sửa issue qua panel lịch sử bị khóa. Không có sprint ACTIVE hiện hướng dẫn mở Backlog.
9. Đăng nhập developer: thao tác card theo EDIT_ISSUE, không cấu hình board nếu thiếu MANAGE_BOARD. Outsider không đọc/sửa dữ liệu SHOP. Đổi tài khoản tại tab khác phải xóa card/form của phiên trước.

## Cách xử lý và hợp đồng

- GET boards/{id}/issues hiện trả cả project; FE giao tập với GET sprints/{id}/issues để trình bày sprint. Toàn project vẫn giữ để đếm WIP và quy đổi index. Khi thả giữa hai card sprint, index được quy đổi theo anchor card trong cột toàn project sau khi bỏ chính card đang kéo; giữ thứ tự tương đối card ẩn.
- PUT boards/{boardId}/issues/{issueId}/move gửi columnId, statusId, position, expectedVersion và sprintId. Màn connected luôn gửi sprintId. Backend cũ không nhận field mới sẽ không có guard sprint nên cần cập nhật BE cùng FE.
- Backend giữ kiểm quyền/issue cùng project, khóa projects, refresh/version rồi đọc lại sprint/link. Thiếu sprint404, khác project400, không ACTIVE hoặc mất membership409 trước ghi. Luồng đổi status dùng workflow/WIP/lịch sử/notifications/metrics cũ; cùng transaction với rank.
- Move/close/remove dùng chung khóa project. Test DB kiểm cả thứ tự move commit trước rồi close/remove tiếp tục, lẫn close/remove trước rồi move409. Client legacy bỏ sprintId vẫn dùng board toàn project như cũ.
- BFF chỉ mở đúng route/method/body/query cần thiết, kiểm Origin và cookie HttpOnly; không nhận actor/token browser. Mutation kiểm scope actor/vòng đời, thêm canDispatch kiểm điều kiện mới nhất sau chờ khóa/auth. Sau commit vẫn invalidate/cache-complete theo actor; lỗi đọc sau commit không làm bỏ đồng bộ.
- Cache board/board-catalog theo actor/project/board/sprint; issue/sprint/config mutation invalidate cùng các màn issue/backlog/project. Lỗi refetch giữ panel/draft đã có, khóa ghi và giữ Hủy/Đóng dùng được khi không có write pending. Không replay mutation sau401/409/timeout.

## Kiểm chứng thực tế

- Build production và TypeScript đạt. Preview `.next-connected-build`, cổng3130.
- **99 FE unit**: 75 connected (19 case board mới) +6 planning +18 UI model, không fail.
- **387 backend unit**, **55 integration PostgreSQL riêng**, không fail/error/skip. Integration gồm stale version, tranh WIP, rollback notification và 4 case move tranh close/remove trong hai thứ tự khóa.
- Browser production/DB demo: **13 nhóm board +13 auth +11 project +15 issue/backlog =52 nhóm đạt**. Board gồm tạo/config/map đa status/WIP/add-delete column, DnD chuột và bàn phím/F5, scope sprint có card project ẩn, multi-status reorder giữ status, filter/menu,409, CLOSED và backend guard, quyền/mobile/unknown ID, đổi tài khoản.
- Test lỗi có kiểm soát: refetch503 khi workflow đang chờ,503 khi mutation đang chờ auth, form tạo board đang mở khi gate đọc lỗi; xác nhận không dispatch stale write và Cancel vẫn hoạt động. Đây là browser response injection phục vụ kiểm nhánh, không phải lỗi backend thực tế.
- Một reviewer chỉ đọc đối chiếu 10 tiêu chí AGENTS và kiểm lại findings. Đã sửa các finding reorder đa status, lỗi position bị nuốt, stale editable qua workflow/auth, và form tạo board giữ quyền cũ; không còn finding mở trong phạm vi review. Reviewer không trực tiếp chạy test; kết quả trên do agent chính chạy.
- Đã kiểm ảnh desktop/mobile và viewport; artifact/log ở `outputs/backend-integration/board/` ngoài Git. Dữ liệu E2E đã được dọn, demo được cấu hình qua API; issue key không tái dùng nên có khoảng số.

## Giới hạn và phối hợp máy kia

- Chưa websocket/live push hoặc benchmark tải lớn. Cập nhật qua mutation, refocus và nút Tải lại. Tải card toàn project theo API hiện có; không tuyên bố phân trang server cho board.
- expectedVersion bảo vệ issue đang kéo; không có revision toàn board/cột cho mọi reorder giữa các issue khác nhau. Trạng thái CLOSED là hiện tại của issue còn link lịch sử, không phải snapshot.
- Guard sprint là tùy chọn để giữ tương thích API cũ; đây không phải endpoint chặn mọi thao tác board toàn project khi client cố ý bỏ sprintId.
- Cấu hình đổi thứ tự cột chưa nối trong lượt này; thứ tự hiển thị dùng position hiện có, cột mới thêm cuối. Không thêm API cấu hình status/workflow, reports, notifications hoặc phần members/account của máy kia.
- Máy kia cần lấy nền FE mới trước ghép patch BFF: server.ts thêm import board contract/whitelist, IssuePanel thêm readOnly mặc địnhfalse, useIssueWrite.run thêm canDispatch tùy chọn mặc địnhtrue và invalidate board domains. Không chép đè client/session/server từ nhánh cũ.

## Chạy lại

- Unit FE: npm run test:connected; npm run test:planning; npm run test:ui-demo.
- BE: .\\mvnw.cmd -B -ntp test; .\\scripts\\test-postgres.ps1 (cluster riêng55432 do script tạo, không dùng DB ứng dụng).
- Browser: đặt CONNECTED_CREDENTIALS, CONNECTED_URL, CONNECTED_OUTPUT, PLAYWRIGHT_MODULE, CHROMIUM_PATH theo máy; npm run test:board:browser. Backend setup mặc định http://127.0.0.1:8080/api, đổi bằng CONNECTED_BACKEND.
- Chỉ chạy browser mutation trên DB test riêng: bài test tạo/xóa issue/board E2E, map status/workflow và tạo/đóng sprint. Demo hiện ACTIVE cần kết thúc/đổi DB test trước khi chạy bài test giả định chưa có ACTIVE. Lịch sử sprint/metric được giữ theo API; dọn trên DB test bằng script có guard nếu cần, không xóa lịch sử sản phẩm thật.
