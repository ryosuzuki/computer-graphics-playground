// This file is part of libigl, a simple c++ geometry processing library.
// 
// Copyright (C) 2014 Alec Jacobson <alecjacobson@gmail.com>
// 
// This Source Code Form is subject to the terms of the Mozilla Public License 
// v. 2.0. If a copy of the MPL was not distributed with this file, You can 
// obtain one at http://mozilla.org/MPL/2.0/.
#include "writeSTL.h"
#include <iostream>

template <typename DerivedV, typename DerivedF, typename DerivedN>
IGL_INLINE bool igl::writeSTL(
  const std::string & filename,
  const Eigen::PlainObjectBase<DerivedV> & V,
  const Eigen::PlainObjectBase<DerivedF> & F,
  const Eigen::PlainObjectBase<DerivedN> & N,
  const bool ascii)
{
  using namespace std;
  assert(N.rows() == 0 || F.rows() == N.rows());
  if(ascii)
  {
    FILE * stl_file = fopen(filename.c_str(),"w");
    if(stl_file == NULL)
    {
      cerr<<"IOError: "<<filename<<" could not be opened for writing."<<endl;
      return false;
    }
    fprintf(stl_file,"solid %s\n",filename.c_str());
    for(int f = 0;f<F.rows();f++)
    {
      fprintf(stl_file,"facet normal ");
      if(N.rows()>0)
      {
        fprintf(stl_file,"%e %e %e\n",
          (float)N(f,0),
          (float)N(f,1),
          (float)N(f,2));
      }else
      {
        fprintf(stl_file,"0 0 0\n");
      }
      fprintf(stl_file,"outer loop\n");
      for(int c = 0;c<F.cols();c++)
      {
        fprintf(stl_file,"vertex %e %e %e\n",
          (float)V(F(f,c),0),
          (float)V(F(f,c),1),
          (float)V(F(f,c),2));
      }
      fprintf(stl_file,"endloop\n");
      fprintf(stl_file,"endfacet\n");
    }
    fprintf(stl_file,"endsolid %s\n",filename.c_str());
    fclose(stl_file);
    return true;
  }else
  {
    FILE * stl_file = fopen(filename.c_str(),"wb");
    if(stl_file == NULL)
    {
      cerr<<"IOError: "<<filename<<" could not be opened for writing."<<endl;
      return false;
    }
    // Write unused 80-char header
    for(char h = 0;h<80;h++)
    {
      fwrite(&h,sizeof(char),1,stl_file);
    }
    // Write number of triangles
    unsigned int num_tri = F.rows();
    fwrite(&num_tri,sizeof(unsigned int),1,stl_file);
    assert(F.cols() == 3);
    // Write each triangle
    for(int f = 0;f<F.rows();f++)
    {
      vector<float> n(3,0);
      if(N.rows() > 0)
      {
        n[0] = N(f,0);
        n[1] = N(f,1);
        n[2] = N(f,2);
      }
      fwrite(&n[0],sizeof(float),3,stl_file);
      for(int c = 0;c<3;c++)
      {
        vector<float> v(3);
        v[0] = V(F(f,c),0);
        v[1] = V(F(f,c),1);
        v[2] = V(F(f,c),2);
        fwrite(&v[0],sizeof(float),3,stl_file);
      }
      unsigned short att_count = 0;
      fwrite(&att_count,sizeof(unsigned short),1,stl_file);
    }
    fclose(stl_file);
    return true;
  }
}

template <typename DerivedV, typename DerivedF>
IGL_INLINE bool igl::writeSTL(
  const std::string & filename,
  const Eigen::PlainObjectBase<DerivedV> & V,
  const Eigen::PlainObjectBase<DerivedF> & F,
  const bool ascii)
{
  return writeSTL(filename,V,F, Eigen::PlainObjectBase<DerivedV>(), ascii);
}

#ifdef IGL_STATIC_LIBRARY
template bool igl::writeSTL<Eigen::Matrix<double, -1, -1, 0, -1, -1>, Eigen::Matrix<int, -1, -1, 0, -1, -1> >(std::basic_string<char, std::char_traits<char>, std::allocator<char> > const&, Eigen::PlainObjectBase<Eigen::Matrix<double, -1, -1, 0, -1, -1> > const&, Eigen::PlainObjectBase<Eigen::Matrix<int, -1, -1, 0, -1, -1> > const&, bool);
#endif
