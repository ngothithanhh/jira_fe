# Issue và backlog đã nối API thật

## Kiểm tra trên máy hiện tại

- FE production: http://127.0.0.1:3130/app/sign-in
- Issue SHOP: http://127.0.0.1:3130/app/projects/1/issues
- Backlog SHOP: http://127.0.0.1:3130/app/projects/1/backlog
- Backend: cổng 8080, PostgreSQL `jira_demo_ready`, schema validate. Không đổi DB cá nhân hoặc migration trong phần này.
- PM: `pm.demo@example.test`; developer: `dev.demo@example.test`; admin: `admin.demo@example.test`; outsider: `outsider.demo@example.test`.
- Mật khẩu ở file local ngoài Git `outputs/backend-integration/credentials.local.json` tính từ workspace cha của `work`. Không sao chép credential vào commit, ảnh hoặc tài liệu chia sẻ.
- SHOP có 9 công việc, 1 sprint FUTURE: loại, người nhận, ưu tiên, điểm và trạng thái thật. Hai công việc đã nằm trong sprint; công việc DONE không nằm trong product backlog. Dữ liệu E2E của lần kiểm đã được dọn, counter mã issue không quay lùi.

## Luồng người dùng kiểm tra

1. Đăng nhập PM → Dự án → Website thương mại điện tử → Công việc. Tìm mã/tên; đổi trạng thái, loại, người nhận, ưu tiên; đổi số dòng/trang. Bộ lọc kết hợp AND và phân trang tại backend.
2. Tạo công việc → chọn loại Task → nhập tên/mô tả/ưu tiên; có thể tìm/chọn cha cùng dự án → Tạo. Mở issue vừa tạo, F5 hoặc mở lại để đối chiếu dữ liệu.
3. Sửa tên/mô tả/ưu tiên/story points → Lưu thay đổi. Hủy thay đổi khôi phục bản đã đọc gần nhất. Phân công chọn thành viên → Lưu phân công; chọn Chưa phân công để gỡ.
4. Chọn bước chuyển hợp lệ → Đổi trạng thái. Demo có Cần làm → Đang thực hiện → Đã nghiệm thu → Cần làm. Issue DONE vẫn ở danh sách issue nhưng ra khỏi product backlog. Backend kiểm workflow/WIP trước khi ghi.
5. Sang Backlog: kéo trong một nhóm để sắp xếp, hoặc dùng bàn phím Space → mũi tên → Space trên handle. F5 kiểm thứ tự. Bật tìm kiếm/lọc sẽ tắt kéo để không gửi thiếu danh sách.
6. Menu ba chấm → Chuyển tới sprint hoặc Đưa về backlog. Muốn chuyển giữa hai sprint, đưa về backlog trước. Tạo sprint → đưa issue vào → Bắt đầu sprint → Hoàn tất sprint; việc chưa xong về backlog hoặc sprint đích đã chọn, DONE giữ lịch sử.
7. Mở chi tiết → Xóa công việc → gõ đúng mã → Xác nhận xóa. Version cũ hoặc quan hệ cản xóa trả409 và giữ dữ liệu; không tự gửi lại DELETE. Parent còn child cần xử lý child trước.
8. Đăng nhập developer kiểm nút theo quyền thật; không có MANAGE_SPRINT thì không quản lý sprint. Outsider không đọc/tạo issue SHOP. Mở thêm tab, đổi tài khoản: bản nháp và dữ liệu của phiên trước phải biến mất.

## Kiểm chứng đã thực hiện

- TypeScript và `npm run build`: đạt; artifact `.next-connected-build`, server preview cổng3130.
- FE: 56 connected + 6 planning + 18 UI model = 80 unit đạt.
- BE: `IssueRegressionTest`, `IssueQueryRegressionTest`, `BacklogRegressionTest`: 51 đạt. Đây là nhóm hồi quy liên quan, không phải toàn bộ bộ test backend.
- Browser production/DB demo: 15 nhóm issue/backlog đạt, 13 nhóm auth và 11 nhóm project đạt. Có tạo/sửa/gán/workflow, phân trang, keyboard drag/F5, scope reorder thiếu409, sprint lifecycle, stale delete409, typed delete, quyền và đổi tab.
- Nhánh form/cache được kiểm bằng request chậm và response lỗi có kiểm soát: clean form nhận bản mới, dirty form giữ draft khi refetch503, X/Escape không cắt ngang ghi, reference đổi không làm mất panel, lỗi đọc không khóa nút Hủy, client thứ hai ghi C trước GET refresh thì completion giữ C.
- Đã kiểm ảnh desktop/mobile và viewport; không có lỗi runtime không được bắt trong lượt browser. Log, ảnh và JSON kết quả nằm ngoài Git ở `outputs/backend-integration/issues/`.
- Một reviewer chỉ đọc đối chiếu 10 tiêu chí AGENTS và kiểm lại finding sau sửa. Các finding trong phạm vi proxy/session/form/cache đã xử lý. Không có kết luận benchmark hay tải đồng thời diện rộng từ các test này.
- Quét credential trước push và `git diff --check`: đạt. Backend không có thay đổi code cần commit.

## Giới hạn và phối hợp máy kia

- Summary/mô tả hiện tối đa255 ký tự theo schema/API đang có; chưa phải editor rich text.
- DELETE có expectedVersion; sửa metadata/assign/status hiện theo hợp đồng backend cũ, chưa nhận expectedVersion từ client. Reorder kiểm đủ scope nhưng chưa có revision toàn backlog; hai reorder hợp lệ có thể lượt cuối thắng.
- Comment/attachment, Scrum board và các phần notifications/reports/members/profile không mở rộng ở lượt này. Nhánh máy kia chưa được merge tự động vào baseline.
- `server.ts` mới import `issues/contract.ts` để mở đúng whitelist. Khi ghép patch BFF máy kia, bổ sung endpoint vào nền hiện tại, không chép đè server/client/session bằng bản nhánh cũ. Các file members/account vẫn thuộc máy kia.
- BFF dùng cookie HttpOnly/Origin và BE vẫn kiểm quyền. Mọi write dùng connectedMutation; cache/form completion chỉ chạy sau kiểm lại actor cookie. Không tự retry business write sau timeout/401/409.

## Chạy lại test

Unit: `npm run test:connected`, `npm run test:planning`, `npm run test:ui-demo`.

Browser: đặt `CONNECTED_CREDENTIALS` trỏ file credential local; `CONNECTED_URL` tới FE production; `PLAYWRIGHT_MODULE` và `CHROMIUM_PATH` theo runtime trên máy; chạy `npm run test:issues:browser`. Mặc định backend setup là http://127.0.0.1:8080/api, có thể đổi bằng `CONNECTED_BACKEND`. Chỉ chạy trên DB demo riêng: script tạo/sửa/xóa issue test và tạo/hoàn tất sprint E2E; không dùng DB người dùng thật. Script cleanup issue theo tiền tố E2E; lịch sử sprint/metric cần dọn trong DB test khi tái sử dụng demo, không xóa lịch sử sản phẩm.
