package com.example.partitioning.service;

import com.example.partitioning.entity.Sale;

import java.util.List;

public interface SaleService {
    Sale create(Sale sale);

    List<Sale> findAll();

    Sale update(Long id, Sale sale);

    void delete(Long id);
}
