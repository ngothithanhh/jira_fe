# Bộ trang duyệt giao diện đồng bộ

Người dùng duyệt hướng Jira ở fc5c366 và muốn bấm qua vài trang để đối chiếu với màn cũ. Đợt này tạo các trang review có điều hướng thật; không tuyên bố các luồng production cũ đã đồng bộ hoặc đã nối BE.

1. `/ui-review/layout` chặn production bằng notFound trước khi render provider. Provider giữ fixture PlanningData và mô tả project trong bộ nhớ; các Link giữ provider nên dữ liệu còn khi qua Backlog/Board/Công việc/Thành viên/Cài đặt. Refresh mới reset. Không API/localStorage/DB, không dùng tài khoản thật.
2. PlanningShell nhận page để đánh dấu aria-current đúng. Chỉ ở review mới có Link tới /ui-review/*; trang Backlog thật giữ các đường dẫn hiện có. Đóng sidebar mobile khi chọn Link. Bỏ shell riêng ở BacklogPreview, dùng shell chung của layout để tránh nhân đôi header.
3. Tách avatar/status/type và form chi tiết issue từ BacklogView thành component chung, giữ mapping/null và callback edit cũ. Board và danh sách dùng lại đúng component đó để không lệch font, màu hoặc field. Không thay API.
4. Board review chỉ dùng issues của sprint ACTIVE, chia cột theo status mẫu. Kéo card chỉ sửa state preview, giữ version và vị trí; sai ID/status/vị trí dừng báo lỗi. Danh sách công việc lấy toàn bộ issue từ cùng state, tìm kiếm/lọc/phân trang cục bộ và mở panel chung. Các trang tạo/sprint dẫn về Backlog thật trong bộ preview, không có nút chết.
5. Thành viên lấy fixture review ghi rõ, hiển thị bảng tên/email/role mẫu. Cài đặt sửa tên/mô tả trong provider, key chỉ đọc. Lưu xong các tên ở sidebar và trang khác cùng cập nhật. Không có thao tác xóa/gán quyền giả.
6. Typecheck/build, unit cho cập nhật state/board và HTTP từng route. Browser Use hiện tắt, người dùng tự mở link nên không báo đã kiểm screenshot hoặc thao tác browser. Commit riêng và gửi các link để người dùng duyệt.
