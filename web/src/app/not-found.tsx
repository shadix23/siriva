import Link from "next/link";

export default function NotFound() {
  return (
    <main id="main" className="page">
      <div className="stack-lg">
        <h1>Страница не найдена</h1>
        <p className="lead">Такой страницы нет. Можно вернуться на главную.</p>
        <div className="actions">
          <Link className="btn btn-primary btn-block" href="/app">
            На главную
          </Link>
        </div>
      </div>
    </main>
  );
}
