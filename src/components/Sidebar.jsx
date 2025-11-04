const Sidebar = () => {
  return (
    <div className="w-64 bg-surface border-r border-gray-700 h-full p-4 flex flex-col shadow-md">
      <h2 className="text-xl font-bold mb-4 text-accent">GripTrack</h2>
      <nav className="flex flex-col space-y-2">
        <a href="/" className="hover:text-accent">
          Dashboard
        </a>
        <a href="/login" className="hover:text-accent">
          Login
        </a>
      </nav>
    </div>
  );
};

export default Sidebar;
