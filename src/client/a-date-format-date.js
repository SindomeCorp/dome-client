export function formatDate(date, format = "MM/dd/yyyy", options = {}) {
  const { useUTC = false } = options;

  let day = useUTC ? date.getUTCDate() : date.getDate();
  let month = (useUTC ? date.getUTCMonth() : date.getMonth()) + 1;
  let year = useUTC ? date.getUTCFullYear() : date.getFullYear();
  let hours = useUTC ? date.getUTCHours() : date.getHours();
  let minutes = useUTC ? date.getUTCMinutes() : date.getMinutes();
  let seconds = useUTC ? date.getUTCSeconds() : date.getSeconds();

  format = format.replace("MM", month.toString().replace(/^(\d)$/, "0$1"));

  if (format.indexOf("yyyy") > -1) {
    format = format.replace("yyyy", year.toString());
  } else if (format.indexOf("yy") > -1) {
    format = format.replace("yy", year.toString().substr(2, 2));
  }

  format = format.replace("dd", day.toString().replace(/^(\d)$/, "0$1"));

  if (format.indexOf("t") > -1) {
    format = format.replace("t", hours > 11 ? "pm" : "am");
  }

  if (format.indexOf("HH") > -1) {
    format = format.replace("HH", hours.toString().replace(/^(\d)$/, "0$1"));
  }

  if (format.indexOf("hh") > -1) {
    if (hours > 12) {
      hours -= 12;
    }
    if (hours === 0) {
      hours = 12;
    }
    format = format.replace("hh", hours.toString().replace(/^(\d)$/, "$1"));
  }

  if (format.indexOf("mm") > -1) {
    format = format.replace("mm", minutes.toString().replace(/^(\d)$/, "0$1"));
  }

  if (format.indexOf("ss") > -1) {
    format = format.replace("ss", seconds.toString().replace(/^(\d)$/, "0$1"));
  }

  return format;
}

