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

Khi FE, Spring Boot và PostgreSQL test đang chạy, đặt C2_CREDENTIALS trỏ tới JSON local chứa origin, api và các tài khoản browser, browser-loss, late, other-tab. Mỗi tài khoản có email, oldPassword, newPassword và fullName. Dùng tài khoản giả lập mới cho từng lượt vì script đổi mật khẩu. Có thể đặt PLAYWRIGHT_MODULE, CHROMIUM_PATH và C2_SCREENSHOT. Ca tùy chọn BFF mất response upstream dùng thêm tài khoản upstream-loss và C2_FAULT_FILE trỏ tới dấu hiệu một lần để proxy test cắt response sau khi Spring Boot trả 204.

    node tests/connected-account.browser.cjs

Kiểm tay bằng cách mở hai tab cùng tài khoản. Sửa và hủy tên, sau đó lưu tên khác rồi F5. Thử mật khẩu hiện tại sai và xác nhận vẫn ở trang hồ sơ. Đổi bằng mật khẩu đúng, kiểm cả hai tab về đăng nhập, thử mật khẩu cũ rồi đăng nhập bằng mật khẩu mới.
