import axios from 'axios';

const messages: Record<number, string> = {
  400: 'Dữ liệu không hợp lệ. Vui lòng kiểm tra lại.',
  401: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
  403: 'Bạn không có quyền thực hiện thao tác này.',
  404: 'Không tìm thấy dữ liệu được yêu cầu.',
  409: 'Dữ liệu đã tồn tại hoặc đang được sử dụng.',
  413: 'Tệp tải lên vượt quá dung lượng cho phép.',
  422: 'Không thể thực hiện thao tác. Vui lòng kiểm tra dữ liệu.',
  429: 'Bạn gửi quá nhiều yêu cầu. Vui lòng thử lại sau.',
};

export function getApiErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (!error.response) {
      return error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT'
        ? 'Yêu cầu mất quá nhiều thời gian. Vui lòng thử lại.'
        : 'Không thể kết nối đến máy chủ. Vui lòng kiểm tra kết nối mạng và thử lại.';
    }
    const { status, data } = error.response;
    if (status === 401 && /\/auth\/login(?:\?|$)/.test(error.config?.url || '')) {
      if (data?.code !== 'ACCOUNT_LOCKED' && data?.code !== 'ACCOUNT_DISABLED') {
        return 'Tên đăng nhập hoặc mật khẩu không đúng.';
      }
    }
    if (status >= 500) return 'Hệ thống đang gặp lỗi. Vui lòng thử lại sau.';
    if (status === 403) return messages[403];
    const fields = data?.fieldErrors;
    if (fields && typeof fields === 'object') {
      const details = Object.values(fields).filter((value): value is string => typeof value === 'string' && !!value.trim());
      if (details.length) return details.join('\n');
    }
    if (typeof data?.message === 'string' && data.message.trim()) return data.message;
    return messages[status] || 'Không thể thực hiện yêu cầu. Vui lòng thử lại.';
  }
  return error instanceof Error && error.message
    ? error.message
    : 'Đã xảy ra lỗi. Vui lòng thử lại.';
}
