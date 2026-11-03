import { useQuery } from "@tanstack/react-query";
import { ArrowRight, BookOpenText, GraduationCap, Plus } from "lucide-react";
import { Link } from "react-router-dom";
import { api, getApiError } from "@/services/api";
import type { Subject } from "@/types/api";
import { useAuth } from "@/features/auth/auth-context";

export function ClassesPage() {
  const { user } = useAuth();
  const faculty = user?.role === "faculty";
  const subjectsQuery = useQuery({
    queryKey: ["subjects"],
    queryFn: async () => (await api.get<{ data: Subject[] }>("/subjects")).data.data,
  });
  const subjects = subjectsQuery.data ?? [];

  return (
    <>
      <section className="page-intro">
        <span className="eyebrow">{faculty ? "FACULTY WORKSPACE" : "STUDENT WORKSPACE"}</span>
        <h1>My classes</h1>
        <p>{faculty ? "Manage the classes you teach, their students, and lesson content." : "View the classes you’re enrolled in and continue your lessons."}</p>
      </section>
      <div className="section-heading">
        <div><h2>{faculty ? "Classes you teach" : "Enrolled classes"}</h2><span>{subjects.length} {subjects.length === 1 ? "class" : "classes"}</span></div>
        <Link className="text-action" to={faculty ? "/subjects/new" : "/subjects/join"}><Plus size={16} /> {faculty ? "Create class" : "Join a class"}</Link>
      </div>
      {subjectsQuery.isLoading && <div className="subject-grid" aria-label="Loading classes"><div className="skeleton-card" /><div className="skeleton-card" /></div>}
      {subjectsQuery.isError && <div className="form-message form-error" role="alert">{getApiError(subjectsQuery.error)}<button className="inline-action" onClick={() => void subjectsQuery.refetch()}>Try again</button></div>}
      {!subjectsQuery.isLoading && !subjectsQuery.isError && subjects.length === 0 && (
        <section className="empty-card">
          <span className="empty-icon"><BookOpenText size={23} /></span>
          <h3>{faculty ? "You haven’t created any classes yet" : "You’re not enrolled in any classes yet"}</h3>
          <p>{faculty ? "Create a class to add lessons and invite students to enroll." : "Enter the join code shared by your faculty member to see a class here."}</p>
          <Link className="primary-button link-button" to={faculty ? "/subjects/new" : "/subjects/join"}>{faculty ? "Create class" : "Join a class"} <ArrowRight size={17} /></Link>
        </section>
      )}
      {!subjectsQuery.isLoading && !subjectsQuery.isError && subjects.length > 0 && (
        <section className="subject-grid" aria-label={faculty ? "Classes you teach" : "Your enrolled classes"}>
          {subjects.map((subject) => (
            <article className="subject-card" key={subject._id}>
              <div className="subject-card-banner" style={{ backgroundColor: subject.themeColor }} />
              <div className="subject-card-content">
                <span className="subject-code">{subject.code}</span>
                <h3>{subject.name}</h3>
                <p>{subject.term} · {subject.academicYear}</p>
                {!faculty && subject.facultyName && <span className="faculty-name"><GraduationCap size={15} /> {subject.facultyName}</span>}
                <Link className="subject-open" to={`/subjects/${subject._id}`}>Open class <ArrowRight size={15} /></Link>
                {faculty && <div className="faculty-subject-actions">
                  <Link to={`/subjects/${subject._id}/people`}>Students</Link>
                  <Link to={`/subjects/${subject._id}/reports`}>Reports</Link>
                  <Link to={`/subjects/${subject._id}/edit`}>Manage class</Link>
                </div>}
              </div>
            </article>
          ))}
        </section>
      )}
    </>
  );
}
