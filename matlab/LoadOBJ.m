%
%  Load the OBJ file.
%  x are the coordinates of the mesh.
%  t are the triangle connectivities, the indices of the vertices are count
%  from 1.
%  vt are the 2D texture coordinates, which will be the initial guess in 
%  ARAP algorithm.  
function [x,t,vt]=LoadOBJ(fname)

fid=fopen(fname, 'r');

x=[];
t=[];
vt=[];
xidx=1;
tidx=1;
vtidx=1;
while true
    s=fscanf(fid, '%s', 1);
    if feof(fid)
        break;
    end
    if (s(1,1)=='#')
       s=fgets(fid);
    elseif (s=='v') 
            x(xidx,1)=fscanf(fid, '%f', 1);
            x(xidx,2)=fscanf(fid, '%f', 1);
            x(xidx,3)=fscanf(fid, '%f', 1);
            xidx=xidx+1;
    elseif (strcmp(s, 'vt')) 
            vt(vtidx,1)=fscanf(fid, '%f', 1);
            vt(vtidx,2)=fscanf(fid, '%f', 1);
            vtidx=vtidx+1;
    elseif (s=='f')
        for k=1:3
            t(tidx,k)=fscanf(fid, '%d', 1);
            while true
                s=fscanf(fid, '%c', 1);
                if s~='/'&&(s<'0'||s>'9')
                    break;
                end
            end
        end 
        tidx=tidx+1;
    end
end

a=find(t==0);
if ~isempty(a)
    for i=1:size(t)
        for j=1:3
            t(i,j)=t(i,j)+1;
        end
    end
end

fclose(fid);