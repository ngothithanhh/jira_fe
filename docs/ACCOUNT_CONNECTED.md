# Hồ sơ cá nhân và đổi mật khẩu

Mở /app/account sau khi đăng nhập. Hồ sơ dùng dữ liệu của /api/account/context. Tên người dùng và họ tên có thể sửa. Email đăng nhập và vai trò chỉ đọc. Ảnh đại diện hiển thị chữ cái đầu.

| API BE | Body | Kết quả |
|---|---|---|
| PATCH /api/account/profile | userName và/hoặc fullName | 200 cùng UserResponse của actor |
| POST /api/account/password | oldPassword và newPassword | 204 rỗng sau khi thu hồi phiên |

Hai API lấy actor từ JWT. FE chỉ gửi trường đã thay đổi trong PATCH. Sau phản hồi đúng actor, FE cập nhật tên trong session cache và làm mới các query hiển thị tên. Password mới tối thiểu 8 ký tự và tối đa 72 byte UTF-8. Ô nhập lại mật khẩu chỉ dùng để kiểm tại form.

BE kiểm mật khẩu hiện tại dưới khóa user, ghi hash, tăng auth_version, thu hồi refresh token và ghi audit cùng transaction. BFF trả 204 và xóa jira_access tại /api/backend cùng jira_refresh tại /api/backend/auth. Client phát ended dưới khóa phiên, provider xóa cache và đưa các tab về đăng nhập. Request đang chờ refresh của phiên trước bị hủy theo mốc kết thúc phiên.

Mật khẩu hiện tại sai giữ phiên. Nếu mất phản hồi khi BE có thể đã ghi, giao diện báo chưa xác nhận kết quả và hướng dẫn thử mật khẩu mới. Nếu browser chưa nhận lệnh xóa cookie, cờ logout pending cho phép dọn phiên khi kết nối lại. POST đổi mật khẩu chỉ gửi một lần.

## Kiểm

Chạy bộ test Node 24 và build production.

    node --test tests/connected-account.test.mjs tests/connected-client.test.mjs tests/connected-server.test.mjs
    npm run build

Khi FE, Spring Boot và PostgreSQL test đang chạy, đặt C2_CREDENTIALS trỏ tới JSON local chứa origin, api và các tài khoản browser, browser-loss, late, other-tab, extra. Mỗi tài khoản có email, oldPassword, newPassword và fullName. Tài khoản extra chỉ phục vụ các ca profile/error/queued actor riêng. Dùng tài khoản giả lập mới cho từng lượt vì script đổi mật khẩu. Có thể đặt PLAYWRIGHT_MODULE, CHROMIUM_PATH và C2_SCREENSHOT. Ca tùy chọn BFF mất response upstream dùng thêm tài khoản upstream-loss và C2_FAULT_FILE trỏ tới dấu hiệu một lần để proxy test cắt response sau khi Spring Boot trả 204. Proxy là công cụ test riêng, không thêm điểm cắt lỗi vào ứng dụng production.

    node tests/connected-account.browser.cjs

Kiểm tay bằng cách mở hai tab cùng tài khoản. Sửa và hủy tên, sau đó lưu tên khác rồi F5. Thử mật khẩu hiện tại sai và xác nhận vẫn ở trang hồ sơ. Đổi bằng mật khẩu đúng, kiểm cả hai tab về đăng nhập, thử mật khẩu cũ rồi đăng nhập bằng mật khẩu mới.

## Kết quả ghép tại máy chính — 12/11/2026

- Ghép work/account-profile bd862fa (gồm 8a1e96c, 6eb4258) vào FE510ea37, giữ lịch sử và toàn bộ whitelist project/issue/backlog/board/member/notification/report. BE vẫn bd1b4b5; không đổi schema hoặc code BE.
- Sửa hai lỗi profile: completionfalse sau PATCH commit phải báo đã lưu/chưa xác nhận và khóa gửi tiếp đến reload; rời Account khi response đang về vẫn đánh stale name caches và tải lại header theo đúng cookie actor. Không áp response muộn lên phiên mới. Catch lỗi cũng kiểm cookie trước hiển thị. Cache tên bao gồm notifications/reports.
- 109 FE unit đạt (85 connected +6 planning +18 UI), TypeScript và production build đạt. Next tự thêm types của .next-account-build vào tsconfig; thư mục build được ignore. 35 BE tests được chọn: AccountManagementRegressionTest, AuthRegressionTest, AccountContextRegressionTest; không nhận là đã chạy lại toàn bộ BE.
- 7 nhóm Chromium account đạt trên FE production + Spring Boot + PostgreSQL thật: profile save/cancel/F5/header/mobile và validation; password204/two-tab logout/old access+refresh+password rejected/new password accepted; mất response browser sau BE commit; mất response upstream sau BE commit; late profile sau cookie đổi; double click/rời trang sau commit; completion probe503 khóa resubmit/reload/ordinary error giữ draft; queued profile/password không gửi bằng cookie tài khoản khác. Các nhóm có gộp nhiều bước; đây không phải số lượng mọi test case có thể xảy ra.
- Lỗi mạng/HTTP và thời điểm response được điều khiển bằng Playwright hoặc proxy local riêng. Hai ca mất response vẫn gửi password thật đến BE, kiểm token cũ bị từ chối và đăng nhập được mật khẩu mới. Test queued refresh bị chặn sau password nằm trong Node transport giả; không suy thành đã kiểm mọi lịch xen kẽ trong browser.
- Hồi quy production đạt: 13 auth +11 project +15 issue/backlog +13 board +8 notification/report =60 nhóm, cùng suite thành viên Chromium. SHOP vẫn 9 issue, 1 board và 4 issue trong sprint ACTIVE; các ca ghi dùng fixture riêng. Đã phục hồi estimate báo cáo test và tạo lại notification demo sau kiểm tra.
- Một reviewer chỉ đọc kiểm 10 tiêu chí AGENTS; hai finding profile đã sửa và kiểm lại, không còn finding mở trong phạm vi. Reviewer không trực tiếp chạy test; kết quả trên do main thực hiện. Không bảo đảm toàn bộ backend, tải lớn hoặc mọi interleaving.

## Kiểm bằng tay bản bàn giao

1. Mở http://127.0.0.1:3130/app/account. Dùng tài khoản riêng account.demo@example.test; mật khẩu ban đầu trong outputs/backend-integration/account-merge/manual-credentials.local.json ở workspace cha, ngoài Git. Tài khoản này không có project là đúng; không cần dùng PM để thử đổi mật khẩu.
2. Đổi tên người dùng/họ tên rồi Hủy để kiểm trả giá trị cũ. Nhập lại và Lưu hồ sơ: header phải đổi; F5 vẫn giữ tên đã lưu. Email/role chỉ đọc; avatar dùng chữ cái đầu.
3. Mở thêm tab cùng trang. Thử mật khẩu hiện tại sai, mật khẩu mới dưới 8 ký tự hoặc xác nhận lệch: báo lỗi, chưa kết thúc phiên.
4. Nhập mật khẩu hiện tại đúng và mật khẩu mới bạn chọn. Thành công cả hai tab về đăng nhập; mật khẩu cũ không dùng được, mật khẩu mới đăng nhập được. File credential giữ mật khẩu ban đầu, không tự cập nhật theo mật khẩu bạn chọn.
5. Mở lại profile để kiểm tên còn giữ. Thử trên màn nhỏ; các ô/nút không tràn viewport.

Preview bàn giao gọi thẳng BE8080, không phụ thuộc proxy cắt response dùng cho test. Log/ảnh/fixture nằm trong outputs/backend-integration/account-merge ngoài Git; không push token/password hoặc file build. Chưa có đổi email, upload avatar hay quên mật khẩu qua email trong phạm vi này.
