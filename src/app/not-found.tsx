import Link from "next/link";

export default function NotFound() {
  return (
    <main className="min-h-screen bg-bg-dark flex flex-col items-center justify-center text-center px-6">
      <p className="text-[clamp(4rem,12vw,7rem)] font-black leading-none text-rainbow select-none">
        404
      </p>
      <h1 className="text-white text-[1.5rem] font-bold mt-4 mb-3">
        这个方块被挖掉了
      </h1>
      <p className="text-white/70 text-[0.95rem] mb-8 max-w-[420px]">
        你要找的页面不存在或已被移除。回主世界看看吧。
      </p>
      <div className="flex gap-4 flex-wrap justify-center">
        <Link
          href="/"
          className="boton-minecraft inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-[#228b22] text-white font-bold transition-all duration-300 hover:bg-[#1a6b1a] hover:-translate-y-0.5"
        >
          返回首页
        </Link>
        <Link
          href="/help"
          className="inline-flex items-center px-6 py-3 rounded-lg bg-white/5 border border-white/15 text-white/90 font-semibold transition-all duration-300 hover:bg-white/15"
        >
          查看入服教程
        </Link>
      </div>
    </main>
  );
}
