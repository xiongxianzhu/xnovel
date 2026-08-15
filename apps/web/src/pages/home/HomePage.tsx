const foundations = [
  "React 19 + TypeScript 6",
  "Vite 8 开发与构建",
  "TanStack Query 请求边界",
  "Vitest + Testing Library",
];

export function HomePage() {
  return (
    <main className="page-shell">
      <section className="intro" aria-labelledby="page-title">
        <p className="eyebrow">OPEN-SOURCE FICTION STUDIO</p>
        <h1 id="page-title">XNovel</h1>
        <p className="status">Web 工程已准备就绪</p>
        <p className="summary">
          从短篇到长篇，在一个工作空间里组织灵感、结构、设定和正文，并按需接入
          AI 模型辅助创作。
        </p>

        <ul className="foundation-list" aria-label="工程基础">
          {foundations.map((foundation) => (
            <li key={foundation}>{foundation}</li>
          ))}
        </ul>

        <p className="next-step">
          下一步：根据 <code>docs/tasks.md</code> 实现第一个作品创建与保存闭环。
        </p>
      </section>
    </main>
  );
}
