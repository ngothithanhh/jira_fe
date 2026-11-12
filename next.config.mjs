const nextConfig = {
  reactStrictMode: true,
  // Kiểm build production riêng để không ghi đè cache của giao diện đang mở ở chế độ dev.
  distDir: process.env.NEXT_DIST_DIR || '.next'
}

export default nextConfig
