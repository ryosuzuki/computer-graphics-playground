function WriteOBJ(fname, x, t, vt)

fid=fopen(fname, 'w');

fprintf(fid, '#\n');
fprintf(fid, '# Wavefront OBJ\n');
fprintf(fid, '#\n');
fprintf(fid, '\n');
fprintf(fid, '# %d vertices, %d triangles, 1 groups\n', size(x,1), size(t,1));
fprintf(fid, '\n');
fprintf(fid, '\n');

fprintf(fid, 'vn 0 0 1\n');

for i=1:size(x,1)
    fprintf(fid, 'v %f %f %f\n', x(i,1), x(i,2), x(i,3));
end
fprintf(fid, '\n');

for i=1:size(vt,1)
    fprintf(fid, 'vt %f %f\n', vt(i,1), vt(i,2));
end
fprintf(fid, '\n');

for i=1:size(t,1)
    fprintf(fid, 'f %d/%d %d/%d %d/%d\n', t(i,1),t(i,1),t(i,2),t(i,2),t(i,3),t(i,3));
end

fclose(fid);