import type { Project } from '../api';

type Props = { project: Pick<Project, 'name' | 'color' | 'image'>; size?: number };

export function Avatar({ project, size = 36 }: Props) {
  const style = { width: size, height: size, fontSize: size * 0.46, background: project.color };
  if (project.image) {
    return <img className="avatar" style={style} src={project.image} alt="" />;
  }
  return (
    <span className="avatar" style={style} aria-hidden="true">
      {project.name.trim().charAt(0).toUpperCase()}
    </span>
  );
}
