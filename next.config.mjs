const nextConfig = {
  output: "standalone",
  experimental: {
    serverComponentsExternalPackages: ["dockerode", "node-pty", "@prisma/client", "ssh2", "ssh2-sftp-client"],
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = [...(config.externals || []), "node-pty", "ssh2", "ssh2-sftp-client"];
    }
    return config;
  },
};

export default nextConfig;