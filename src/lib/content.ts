export interface SiteContent {
  site: {
    name: string;
    nav_brand: string;
    description: string;
    keywords: string;
    server_ip: string;
    server_port: string;
    hero_badge: string;
    hero_title: string;
    hero_subtitle: string;
    hero_features: string[];
    footer_description: string;
    footer_copyright: string;
    footer_disclaimer: string;
    friend_links: Array<{ name: string; url: string }>;
  };
  hero: {
    bg_image: string;
  };
  specs: {
    title: string;
    subtitle: string;
    bg_image: string;
    items: Array<{
      icon: string;
      title: string;
      desc: string;
      value: string;
    }>;
  };
  help: {
    title: string;
    subtitle: string;
    bg_image: string;
    steps: Array<{
      number: string;
      title: string;
      desc: string;
      cta?: string;
      cta_href?: string;
    }>;
    launchers: Array<{
      name: string;
      desc: string;
      tag?: string;
      links: Array<{ label: string; url: string; note?: string }>;
    }>;
  };
  features: {
    title: string;
    subtitle: string;
    bg_image: string;
    items: Array<{
      icon: string;
      title: string;
      desc: string;
    }>;
  };
  gallery: {
    title: string;
    subtitle: string;
    bg_image: string;
    items: Array<{
      src: string;
      desc: string;
    }>;
  };
  team: {
    title: string;
    subtitle: string;
    bg_image: string;
    members: Array<{
      name: string;
      role: string;
      desc: string;
      avatar: string;
      contact_href: string;
    }>;
  };
  contact: {
    title: string;
    subtitle: string;
    bg_image: string;
  };
  community: {
    title: string;
    subtitle: string;
    bg_image: string;
    qr_image: string;
    groups: Array<{
      icon: string;
      title: string;
      desc: string;
      btn_text: string;
      btn_class: string;
      btn_href: string;
    }>;
  };
}

const staticUrl = (p: string) => `/static${p}`;

export const defaultContent: SiteContent = {
  site: {
    name: "西域之光",
    nav_brand: "Westworld西域之光",
    description:
      "西域之光（westworld）—— 我的世界原版生存服务器，纯净原版体验、生电友好、和谐社区。稳定流畅，欢迎加入！Minecraft Survival Server.",
    keywords:
      "我的世界, Minecraft, 服务器, 生存服, 原版, 生电, 西域之光, westworld, MC, 游戏, 多人联机",
    server_ip: "sdcmc.chipzz.top:23400",
    server_port: "23400",
    hero_badge: "服务器已更新 10.0 | 版本 26.2",
    hero_title: "西域之光",
    hero_subtitle:
      "一个纯净的原版生存服务器，从零开始，与伙伴一起创造属于你们的世界",
    hero_features: ["纯净原版", "生电友好", "和谐社区"],
    footer_description:
      "西域之光（westworld）原版生存服务器，坚持纯净原版玩法，与玩家共建和谐社区，打造属于大家的世界。",
    footer_copyright: "©2026我的世界Westworld西域之光",
    footer_disclaimer: "",
    friend_links: [
      { name: "我的世界官网", url: "https://mc.163.com/" },
      { name: "我的世界国际服", url: "https://www.minecraft.net/" },
      { name: "启动器下载网盘", url: "https://cloud.inumc.dpdns.org/s/a8c9ad73dc064495a352cbe25aa2561a" },
    ],
  },
  hero: {
    bg_image: staticUrl("/png/c6d2dd6a664242e2e5faa640d28c340b.jpg"),
  },
  specs: {
    title: "服务器配置",
    subtitle: "为了给您提供最流畅的游戏体验，我们不惜成本选用了顶级的企业级硬件设施",
    bg_image: staticUrl("/png/89ce487b74da31797c19a3dc4ffc0d79.jpg"),
    items: [
      {
        icon: staticUrl("/png/CPU.png"),
        title: "高性能处理器",
        desc: "AMD Ryzen 9 9950X 旗舰桌面处理器，16 核 32 线程，多核性能强劲",
        value: "Ryzen 9 9950X",
      },
      {
        icon: staticUrl("/png/RAM.png"),
        title: "运行内存",
        desc: "为服务器分配 12GB 运行内存，流畅运行原版生存与红石机械",
        value: "12GB",
      },
      {
        icon: staticUrl("/png/network.png"),
        title: "网络带宽",
        desc: "三线 BGP 优化线路，千兆上下行对等带宽，低延迟畅玩",
        value: "1Gbps BGP",
      },
      {
        icon: staticUrl("/png/SSD.png"),
        title: "高速存储",
        desc: "企业级 NVMe SSD RAID 10 阵列，地图加载瞬间完成",
        value: "NVMe RAID 10",
      },
    ],
  },
  help: {
    title: "下载",
    subtitle: "下载启动器与客户端，即可开启您的方块世界冒险之旅",
    bg_image: staticUrl("/png/9cca3afcca8c0a79eac6a39aad5d65ec.jpg"),
    steps: [
      {
        number: "01",
        title: "下载启动器",
        desc: "我们需要MC启动器才能进入服务器。点击下方按钮前往网盘下载，下载密码：westworld。",
        cta: "下载启动器",
        cta_href: "https://cloud.inumc.dpdns.org/s/a8c9ad73dc064495a352cbe25aa2561a",
      },
      {
        number: "02",
        title: "添加服务器",
        desc: "启动游戏，选择“多人游戏” -> “添加服务器”，输入服务器地址 sdcmc.chipzz.top:23400。基岩版玩家可通过 Geyser 直接加入，支持 Bedrock 26.0-26.40 与 Java 1.7-26.2，端口同为 23400。",
      },
      {
        number: "03",
        title: "进入游戏",
        desc: "双击服务器列表中的图标，即可连接进入服务器，开始您的探索！",
      },
    ],
    launchers: [
      {
        name: "PCL2 启动器",
        desc: "国内最流行的第三方启动器，界面简洁、功能强大，支持多版本。",
        tag: "推荐",
        links: [
          {
            label: "夸克网盘",
            url: "https://pan.quark.cn/s/cb915afd9a91#/list/share",
          },
          {
            label: "迅雷网盘",
            url: "https://pan.xunlei.com/s/VO_leMclUGQL1OOKN1HCGssXA1?pwd=ktvg",
            note: "提取码 ktvg",
          },
          {
            label: "蓝奏云",
            url: "https://ltcat.lanzouv.com/b0aj6gsid",
            note: "密码 pcl2",
          },
        ],
      },
      {
        name: "HMCL 启动器",
        desc: "开源跨平台启动器，支持 Windows / macOS / Linux。",
        tag: "官方",
        links: [{ label: "官网下载", url: "https://hmcl.huangyuhui.net" }],
      },
      {
        name: "PCL CE 启动器",
        desc: "PCL 社区版启动器，由社区维护的全新版本。",
        tag: "社区",
        links: [{ label: "官网下载", url: "https://pclce-web.demo.fis.ink" }],
      },
      {
        name: "FCL 启动器",
        desc: "手机版启动器，在手机上也能轻松游玩。",
        tag: "官方",
        links: [
          { label: "官网下载", url: "https://foldcraftlauncher.cn/html/down.html?id=0" },
        ],
      },
    ],
  },
  features: {
    title: "游戏特色",
    subtitle: "探索我们精心打造的独特玩法与系统",
    bg_image: staticUrl("/png/7649e2dbc7044ee71743022dd2d51701.jpg"),
    items: [
      {
        icon: staticUrl("/egg/002.png"),
        title: "纯净原版",
        desc: "不添加花哨的插件系统，回归原汁原味的生存体验，每一处风景都来自玩家亲手创造。",
      },
      {
        icon: staticUrl("/egg/003.png"),
        title: "生电友好",
        desc: "支持大型红石机械与生电设施，服务器性能强劲，红石玩家的天堂。",
      },
      {
        icon: staticUrl("/egg/001.png"),
        title: "自由建筑",
        desc: "广阔世界任你开垦，与好友一起打造宏伟建筑，让想象力自由驰骋。",
      },
    ],
  },
  gallery: {
    title: "游戏截图",
    subtitle: "每一帧都是壁纸，记录我们在服务器的点点滴滴",
    bg_image: staticUrl("/png/f5ea0ca06bf5ac36704b7277536ab53d.jpg"),
    items: [
      {
        src: staticUrl("/gallery/7.0/0E2D6F9CD381F3079126EF6E4EE0CDBE.png"),
        desc: "【樱雪城】夜晚的樱花高塔，紫色樱花环绕，塔顶光束直冲云霄",
      },
      {
        src: staticUrl("/gallery/7.0/17D840E96D54EB6D1A0035B269EDC7A5.png"),
        desc: "【樱雪城】樱花与建筑交相辉映的唯美一隅",
      },
      {
        src: staticUrl("/gallery/7.0/5A7B0F9736F3F9A272352B5D6A7BC818.png"),
        desc: "【樱雪城】粉色樱林中的空中之城",
      },
      {
        src: staticUrl("/gallery/7.0/70BEB2401D6D2D54D6EB6F9014BA137C.png"),
        desc: "【樱雪城】灯火通明的城市夜景",
      },
      {
        src: staticUrl("/gallery/7.0/89829D2F43E4A3B550773DABFF39F1DF.png"),
        desc: "【樱雪城】城中的艺术画廊，陈列着大家的杰作",
      },
      {
        src: staticUrl("/gallery/7.0/F4F8AF2FF5A20845574F97B048F0020E.png"),
        desc: "【樱雪城】繁花簇拥的街道与楼阁",
      },
      {
        src: staticUrl("/gallery/7.0/2236ED30FAB32D4F6DA1FD6A68E5A850.png"),
        desc: "【海樱城】黄昏下的海滨建筑群",
      },
      {
        src: staticUrl("/gallery/7.0/E2EF93B7404B13B6EF653DA1A40EC923.png"),
        desc: "【海樱城】阳光洒落的海岸一景",
      },
      {
        src: staticUrl("/gallery/7.0/65B3B257DF921990C4F7816EC2403D32.png"),
        desc: "【汉武帝の家】草原上的现代风格宅邸与瞭望塔",
      },
      {
        src: staticUrl("/gallery/7.0/DD1B82441A94B92680DF19D86140233E.png"),
        desc: "【汉武帝の家】庭院与居所，田园牧歌般的生活",
      },
      {
        src: staticUrl("/gallery/7.0/607C3FE207E268082AC6B384B85CBBBD.png"),
        desc: "【晓家庄】月色下的静谧村落",
      },
      {
        src: staticUrl("/gallery/7.0/9F49FF79313D39CB1BC179B61B0B791C.png"),
        desc: "【晓家庄】错落有致的村中建筑",
      },
      {
        src: staticUrl("/gallery/7.0/DF708F960B562122CB26C07E17BE8F5A.png"),
        desc: "【晓家庄】绿意环绕的村庄一角",
      },
      {
        src: staticUrl("/gallery/7.0/28AFCF0F2AAE19781908AF6FC7875742.png"),
        desc: "【工业区】大型石质厂房与红石装置",
      },
      {
        src: staticUrl("/gallery/7.0/5F04DE10D37E87F828B326ABDDF20F0F.png"),
        desc: "【工业区】灯火通明的机械化生产车间",
      },
      {
        src: staticUrl("/gallery/7.0/D2063CE9375537053F90B9699D869704.png"),
        desc: "【工业区】红石机械与自动化设施",
      },
      {
        src: staticUrl("/gallery/7.0/0590E50BAC3B6F6E3AE54A7AF9C7F3BD.png"),
        desc: "平原上的樱花村落与白色高塔，风景如画",
      },
      {
        src: staticUrl("/gallery/6.0/1.jpg"),
        desc: "樱花树下的烟花庆典，热闹非凡",
      },
      {
        src: staticUrl("/gallery/6.0/2.jpg"),
        desc: "黄昏时分的樱花平台合影留念",
      },
      {
        src: staticUrl("/gallery/6.0/3.jpg"),
        desc: "俯瞰浮空小镇，创意十足的建筑群",
      },
      {
        src: staticUrl("/gallery/6.0/4.jpg"),
        desc: "空岛夜景，万家灯火",
      },
      {
        src: staticUrl("/gallery/6.0/7.jpg"),
        desc: "雪地中的木质小镇，静谧美好",
      },
      {
        src: staticUrl("/gallery/6.0/8.jpg"),
        desc: "服务器风光随拍",
      },
      {
        src: staticUrl("/gallery/6.0/9.jpg"),
        desc: "沿海而建的玩家基地",
      },
      {
        src: staticUrl("/gallery/6.0/10.jpg"),
        desc: "服务器风光随拍",
      },
      {
        src: staticUrl("/gallery/6.0/1b6a7edab82a87473c3b913acfb09174.png"),
        desc: "服务器建筑随拍",
      },
      {
        src: staticUrl("/gallery/6.0/2024-07-19_11.11.51.png"),
        desc: "服务器建筑随拍",
      },
      {
        src: staticUrl("/gallery/6.0/2024-07-20_15.13.20.png"),
        desc: "服务器建筑随拍",
      },
      {
        src: staticUrl("/gallery/6.0/3af288174532c99af3a67ded69c16f60.png"),
        desc: "服务器风光随拍",
      },
    ],
  },
  team: {
    title: "管理团队",
    subtitle: "专业的运营团队，致力于为您提供最好的游戏体验",
    bg_image: staticUrl("/png/achXdg.jpg"),
    members: [
      {
        name: "Icefish_123",
        role: "服主 & 运维",
        desc: "负责服务器整体规划与运营，确保服务器长期稳定运行。",
        avatar: staticUrl("/team/icefish_123.png"),
        contact_href: "#",
      },
      {
        name: "xiaoming",
        role: "服务器管理",
        desc: "负责服务器日常管理与玩家事务，维护游戏秩序与社区氛围。",
        avatar: staticUrl("/team/xiaoming.png"),
        contact_href: "#",
      },
      {
        name: "weijiaChen0324",
        role: "服务器运维",
        desc: "负责服务器技术运维、Bug 修复与性能优化。",
        avatar: staticUrl("/team/weijiaChen0324.jpg"),
        contact_href: "#",
      },
      {
        name: "Season_fle",
        role: "服务器管理",
        desc: "负责玩家社区运营与日常管理，处理玩家反馈与事务。",
        avatar: staticUrl("/team/seasonfle.png"),
        contact_href: "#",
      },
      {
        name: "xiaoyiy626",
        role: "网站开发者",
        desc: "负责官方网站的搭建、开发与日常维护。",
        avatar: staticUrl("/team/xiaoyiy626.png"),
        contact_href: "#",
      },
    ],
  },
  contact: {
    title: "联系我们",
    subtitle: "有任何问题或建议？通过邮件直接联系服主",
    bg_image: staticUrl("/png/5e1e1be033cbd911e62327519886379f.jpg"),
  },
  community: {
    title: "加入社区",
    subtitle: "加入我们的玩家交流群，获取最新资讯与福利",
    bg_image: staticUrl("/png/wj_Narcissa_3.png"),
    qr_image: staticUrl("/qq-group-qr.jpg"),
    groups: [
      {
        icon: staticUrl("/png/QQ.png"),
        title: "官方QQ群",
        desc: "群号：838177210，与其他玩家实时交流，获取最新公告",
        btn_text: "QQ群：838177210",
        btn_class: "qq-btn",
        btn_href: "#",
      },
    ],
  },
};

export function getContent(): SiteContent {
  return defaultContent;
}

// 相册图片地点映射（src -> 地点名），用于首页相册筛选
// 6.0 图片通过 /gallery/6.0/ 路径前缀识别，无需在此登记
export const galleryLocations: Record<string, string> = {
  "/static/gallery/7.0/0E2D6F9CD381F3079126EF6E4EE0CDBE.png": "樱雪城",
  "/static/gallery/7.0/17D840E96D54EB6D1A0035B269EDC7A5.png": "樱雪城",
  "/static/gallery/7.0/5A7B0F9736F3F9A272352B5D6A7BC818.png": "樱雪城",
  "/static/gallery/7.0/70BEB2401D6D2D54D6EB6F9014BA137C.png": "樱雪城",
  "/static/gallery/7.0/89829D2F43E4A3B550773DABFF39F1DF.png": "樱雪城",
  "/static/gallery/7.0/F4F8AF2FF5A20845574F97B048F0020E.png": "樱雪城",
  "/static/gallery/7.0/2236ED30FAB32D4F6DA1FD6A68E5A850.png": "海樱城",
  "/static/gallery/7.0/E2EF93B7404B13B6EF653DA1A40EC923.png": "海樱城",
  "/static/gallery/7.0/65B3B257DF921990C4F7816EC2403D32.png": "汉武帝の家",
  "/static/gallery/7.0/DD1B82441A94B92680DF19D86140233E.png": "汉武帝の家",
  "/static/gallery/7.0/607C3FE207E268082AC6B384B85CBBBD.png": "晓家庄",
  "/static/gallery/7.0/9F49FF79313D39CB1BC179B61B0B791C.png": "晓家庄",
  "/static/gallery/7.0/DF708F960B562122CB26C07E17BE8F5A.png": "晓家庄",
  "/static/gallery/7.0/28AFCF0F2AAE19781908AF6FC7875742.png": "工业区",
  "/static/gallery/7.0/5F04DE10D37E87F828B326ABDDF20F0F.png": "工业区",
  "/static/gallery/7.0/D2063CE9375537053F90B9699D869704.png": "工业区",
};
