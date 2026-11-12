# Kiểm giao diện audit

1. Đăng nhập SYSTEM_ADMIN qua /app/sign-in. Vào /app/admin/audit. Thử lọc ID dự án, loại/ID đối tượng, mã thao tác, khoảng ngày hoặc chỉ thao tác hệ thống. Sửa ô lọc chưa đổi kết quả cho tới khi bấm Áp dụng. Kiểm Xóa bộ lọc, phân trang và mở Chi tiết.
2. Đăng nhập lead, vào project và chọn Nhật ký. Bảng chỉ có log của project đang mở. Thử tạo hoặc xóa một issue, rồi tìm theo ISSUE, ID và mã thao tác. Log xóa vẫn còn khi issue không mở được nữa.
3. Đăng nhập member chỉ có VIEW_PROJECT. Link Nhật ký không xuất hiện; truy cập URL trực tiếp không hiện bảng và GET audit trả 403. Cấp UPDATE_PROJECT cho role của member, xác nhận xem được. Thu hồi quyền rồi quay lại tab đang mở, xác nhận bảng và modal cũ biến mất.
4. Mở ở viewport hẹp. Bảng cuộn ngang trong khung; toàn trang không tràn. Audit yêu cầu trình duyệt hỗ trợ Web Locks để xác nhận đúng phiên trước khi hiển thị.

Chạy tests/connected-audit.test.mjs bằng Node có --experimental-strip-types. Bài Chromium tests/connected-audit.browser.cjs cần Next production preview và Spring Boot nối PostgreSQL **demo riêng**. Nó tạm cấp rồi thu hồi UPDATE_PROJECT cho role test. Cấu hình AUDIT_CREDENTIALS trỏ JSON local với các khóa origin, backend, admin, lead, viewer, projectId, otherProjectId, viewerRoleId, updatePermissionId. Ba tài khoản có email và password; không commit file JSON. Dùng PLAYWRIGHT_MODULE và CHROMIUM_PATH nếu runtime không nằm trong node_modules hoặc browser mặc định chưa cài.

Fixture: admin hệ thống, lead của project tên Audit demo, một viewer là member của project đó với role dự án test chưa có grant, một project khác mà lead không được xem. Seed tổng số bản ghi audit toàn cục từ 21 đến 40, có LEGACY_ISSUE với actor null và mô tả dài chứa chuỗi "audit audit audit", cùng LEGACY_NO_ID không có project/entity ID. Đây là dữ liệu trên PostgreSQL; màn hình đọc API thật.
