# Plan nối comment và attachment

Phạm vi người dùng yêu cầu: nối comment/attachment, tự test, commit/push và bàn giao luồng. Nền FE3f49c90, BEbd1b4b5. Người dùng đã chốt triển khai, sau đó chỉ định dùng PostgreSQL local cho cả nội dung file. Không ghép master hoặc triển khai các nhóm quản trị khác.

## 1. Mở chi tiết issue và đọc dữ liệu

- IssuePanel đã dùng chung ở danh sách issue, backlog và Scrum board. Thêm khu vực Bình luận/Tệp đính kèm dưới thông tin hiện tại, dùng lại kit và thiết kế ui-demo, không đọc DemoProvider.
- projectId là projects.project_id của route đã qua ProjectGate; issueId là issues.issue_id từ issue thật, không phải issueNumber trong mã SHOP-12. Chỉ mount phần cộng tác khi detail.projectId khớp projectId và VIEW_PROJECT hợp lệ. Lỗi detail/gate khóa ghi nhưng giữ bản nháp; không cho response issue khác xuất hiện ở panel hiện tại.
- GET issues/{issueId}/comments và GET issues/{issueId}/attachments qua BFF. Các query mới có actor/project/issue trong key, AbortSignal và probe actor dưới khóa phiên như members/inbox; nếu401 cần refresh thì ra khỏi khóa, khôi phục rồi kiểm actor lại. Không trả lỗi thành danh sách rỗng. Đổi tài khoản hoặc issue hủy query và bỏ draft thuộc scope cũ.

## 2. Bình luận: tạo, sửa và xóa

- Component CommentsSection lấy actorId từ session, commentId/userId/version từ CommentResponse. Body tạo chỉ commentText; body sửa gồm commentText/expectedVersion; DELETE gửi expectedVersion. ID tác giả do JWT xác định, không nhận userId từ form. Text phải có nội dung và tối đa10000 ký tự; version không âm và biểu diễn an toàn phía JS. Version null của dữ liệu cũ không được tự đổi thành0 để sửa/xóa.
- Người có VIEW_PROJECT được đọc/thêm. Tác giả còn VIEW_PROJECT hoặc người có EDIT_ISSUE được sửa/xóa. UI ẩn nút theo cùng quy tắc; BE vẫn kiểm lại ownership, comment.issue_id và quyền. Không thuộc issue trả404, thiếu quyền403, version cũ409 trước ghi. Sau409 đọc bản mới nhưng giữ draft/version lúc người dùng bắt đầu sửa, không tự gửi lại bằng version mới. Người dùng chủ động hủy/mở lại thao tác.
- Dùng lại IssueCommentServiceImpl: tạo ghi issue_comments và audit/notification trong transaction; thông báo tới reporter/assignee trừ actor và khử trùng như hiện có. Sửa ghi comment_text/updated_at/version và audit; xóa comment cùng version và audit; không phát lại thông báo bình luận mới khi edit/delete.
- Nếu cần sửa kiểm quyền cục bộ sau project lock để thao tác đang đợi không dùng membership cũ, refresh/recheck trước ghi; không thay phạm vi quyền đã nêu.

## 3. Attachment — PostgreSQL local theo chỉ định mới của người dùng

- Người dùng chỉ định "Dùng local db thôi nhé"; toàn bộ file mới lưu ở PostgreSQL, không upload/xóa/fetch Cloudinary. Cloudinary bean cũ mặc định không bật và không cần credential để chạy ứng dụng.
- Migration007 metadata đã áp dụng nên giữ nguyên checksum. Migration008 thêm storage_type vào issue_attachments và bảng issue_attachment_contents (attachment_id PK/FK, content bytea). Tệp cũ thiếu nội dung local không tự được chuyển từ URL; download trả409 với thông báo rõ. Danh sách chỉ đọc metadata, không SELECT bytea.
- Upload một file không rỗng tối đa10MiB. FE kiểm sớm; BFF đếm byte multipart thực, chỉ nhận một trường file và không ép Content-Type JSON; BE kiểm lại byte/tên. Lấy issueId từ path, uploader từ JWT. Sau EDIT_ISSUE, khóa project/refresh membership actor rồi kiểm quyền lần hai; lưu metadata và bytea cùng transaction. Lỗi ở bất kỳ bước ghi nào rollback cả hai bảng.
- GET issues/{issueId}/attachments/{attachmentId}/content: kiểm parent issue và VIEW_PROJECT trước đọc bytea. Trả attachment Content-Disposition UTF-8, nosniff, no-store. Chỉ raster có magic bytes hợp lệ trả image MIME để preview bằng img; HTML/SVG/định dạng khác trả octet-stream để tải xuống, không iframe hoặc thực thi.
- FE dùng connectedFile: probe actor dưới khóa phiên, đọc Blob từ API cùng origin, kiểm scope lại trước tạo Object URL. URL chỉ phục vụ preview/download của byte BE trả; thu hồi khi đóng/đổi issue/đổi phiên, không dùng như bằng chứng upload thành công.
- DELETE route mới chứa cả issueId/attachmentId. Parent không khớp404; chủ file vẫn cần VIEW_PROJECT, người khác cần EDIT_ISSUE; owner legacy null không gây500. Khóa/recheck rồi bulk delete content và delete metadata cùng transaction. Không tải bytea lên RAM chỉ để xóa. Hai xóa đồng thời chỉ một lượt thành công; lỗi transaction giữ lại cả hai bảng.
- Route DELETE cũ giữ tương thích quyền. Xóa metadata file legacy chỉ tác động DB local; không cam kết đã dọn asset dịch vụ ngoài. Không thêm local disk, Cloudinary, object storage, job retry hoặc dịch vụ khác.
- BFF giữ allowlist/Origin/cookie và byte cap cho upload/download. Không nhận URL hoặc actor từ browser, không tự replay mutation. Giữ nguyên các domain đã nối trước đó.

## 4. Ghi dữ liệu, phản hồi muộn và cập nhật cache

- Thêm hook ghi collaboration riêng, dùng connectedMutation và completeConnectedMutation cùng khóa/capture scope đang có. Khóa bấm đôi giữ qua dispatch/refetch/completion. Kiểm lại quyền gate/issue hiện tại sau khi chờ khóa và ngay trước dispatch, không chỉ dựa nút disabled.
- Mỗi mutation chỉ gửi một lần. Timeout/mất response không retry tự động; UI báo chưa xác nhận, giữ draft/file khi phù hợp và yêu cầu tải lại trước thao tác tiếp nếu có thể đã commit. Mutation đã được BE xác nhận thì cache comment/file/notification actor được stale kể cả panel unmount. Chỉ refetch/hoàn tất khi cookie actor vẫn khớp; response cũ không ghi vào form/cache tài khoản mới.
- Sau create comment làm mới inbox actor đang mở; người nhận khác nhận dữ liệu ở lần focus/reload như hệ thống hiện có. Không thêm WebSocket hoặc gửi email. Sửa/xóa comment không giả tạo thông báo mới. Attachment upload/delete chỉ làm mới danh sách file/issue liên quan. Lỗi refetch không làm mất draft hoặc thành công giả.

## 5. Kiểm chứng, review, commit và bàn giao

- FE unit kiểm contract comment/version, multipart actual size/extra field/Origin/cookie, binary download/no-store/nosniff, actor và không replay; typecheck/build và các suite hồi quy cũ.
- BE unit/API và PostgreSQL riêng: quyền/ownership/parent, comment stale409, metadata+bytea đúng byte, upload/delete rollback, migration007/008 lặp và concurrent delete. Test ProjectSecurity mock phải được phân biệt với browser dùng quyền thật.
- Browser production với BE/PostgreSQL local thật: comment CRUD/draft/cancel/F5/version409, quyền trực tiếp, upload ảnh/text, download so byte, preview an toàn, delete cả nội dung, invalid/oversize, double submit, gate503, queued/late actor switch, completion uncertainty và mobile. Không dùng Cloudinary mock để nhận là upload thật.
- Backup bảng trước migration demo; chỉ chạy jira_demo_ready với schema validate. Giữ SHOP, tạo project/tài khoản thử riêng và dọn fixture sau test.
- Một reviewer độc lập chỉ đọc10 tiêu chí AGENTS; main kiểm/sửa finding trong scope rồi test/review lại. Secret/diff check, commit/push FE và BE, xác minh SHA remote, bàn giao URL/tài khoản/luồng/giới hạn.
